/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * neural.ts — A real, dependency-free multilayer perceptron implemented from
 * scratch for the Gold AI Backtester v2.
 *
 * Design goals ("remembers the past, learns the present, predicts the future"):
 *  - PERSISTENCE: full weight matrices + training buffer serialized to
 *    localStorage so the network truly remembers across sessions.
 *  - ONLINE + BATCH LEARNING: train() does a single online step; replay()
 *    re-trains over the stored experience buffer (experience replay) so old
 *    knowledge is not forgotten when new samples arrive.
 *  - SOFTMAX OUTPUT: proper probability distribution over
 *    [WIN_BUY, WIN_SELL, LOSS] with cross-entropy loss.
 *  - STABILITY: He initialization, gradient clipping, L2 regularization,
 *    and an Adam-style optimizer for smooth convergence.
 */

export type Matrix = number[][];

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

function relu(x: number): number {
  return x > 0 ? x : 0;
}
function reluDeriv(x: number): number {
  return x > 0 ? 1 : 0;
}

function softmax(arr: number[]): number[] {
  const max = Math.max(...arr);
  const exps = arr.map((v) => Math.exp(clamp(v - max, -30, 30)));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((e) => e / sum);
}

interface LayerParams {
  w: Matrix; // [out][in]
  b: number[]; // [out]
  // Adam moments
  mW: Matrix;
  vW: Matrix;
  mB: number[];
  vB: number[];
}

interface SerializedNN {
  layout: number[];
  layers: { w: Matrix; b: number[] }[];
  trainData: { f: number[]; l: number }[];
  step: number;
}

const STORAGE_KEY = 'gold_ai_nn_v2';
const MAX_BUFFER = 1500;

export class NeuralNetwork {
  layout: number[];
  layers: LayerParams[] = [];
  trainData: { f: number[]; l: number }[] = [];
  private step = 0;
  private lr = 0.01;
  private l2 = 1e-5;

  constructor(layout: number[] = [28, 24, 12, 3]) {
    this.layout = layout;
    this.initLayers();
  }

  private initLayers() {
    this.layers = [];
    for (let i = 0; i < this.layout.length - 1; i++) {
      const inN = this.layout[i];
      const outN = this.layout[i + 1];
      const scale = Math.sqrt(2 / inN); // He initialization
      const w: Matrix = Array.from({ length: outN }, () =>
        Array.from({ length: inN }, () => (Math.random() * 2 - 1) * scale)
      );
      const zeros2 = () => Array.from({ length: outN }, () => Array(inN).fill(0));
      this.layers.push({
        w,
        b: Array(outN).fill(0),
        mW: zeros2(),
        vW: zeros2(),
        mB: Array(outN).fill(0),
        vB: Array(outN).fill(0),
      });
    }
  }

  /** Forward pass; returns activations per layer (input included). */
  private forward(input: number[]): { acts: number[][]; zs: number[][] } {
    const acts: number[][] = [input];
    const zs: number[][] = [];
    let cur = input;
    for (let li = 0; li < this.layers.length; li++) {
      const layer = this.layers[li];
      const z: number[] = new Array(layer.w.length);
      for (let o = 0; o < layer.w.length; o++) {
        let sum = layer.b[o];
        const row = layer.w[o];
        for (let k = 0; k < row.length; k++) sum += row[k] * cur[k];
        z[o] = sum;
      }
      zs.push(z);
      const isOutput = li === this.layers.length - 1;
      cur = isOutput ? softmax(z) : z.map(relu);
      acts.push(cur);
    }
    return { acts, zs };
  }

  /** Returns softmax probabilities [pWinBuy, pWinSell, pLoss]. */
  predict(input: number[]): number[] {
    const x = this.normalize(input);
    return this.forward(x).acts[this.layers.length];
  }

  /** Confidence that a trade in `dir` will win. */
  confidence(input: number[], dir: 'BUY' | 'SELL'): number {
    const p = this.predict(input);
    return dir === 'BUY' ? p[0] : p[1];
  }

  private normalize(input: number[]): number[] {
    // Features are already designed in [-1,1] / [0,1]; clamp for safety.
    return input.map((v) => clamp(Number.isFinite(v) ? v : 0, -3, 3));
  }

  /** Single supervised step with Adam + cross-entropy. label: 0/1/2. */
  train(input: number[], label: number, lr = this.lr): number {
    const x = this.normalize(input);
    const { acts, zs } = this.forward(x);
    const out = acts[acts.length - 1];
    const target = [0, 0, 0];
    target[label] = 1;

    // Cross-entropy loss
    const loss = -Math.log(clamp(out[label], 1e-9, 1));

    // Output gradient (softmax + CE): out - target
    let delta = out.map((o, i) => o - target[i]);

    this.step++;
    const b1 = 0.9, b2 = 0.999, eps = 1e-8;

    for (let li = this.layers.length - 1; li >= 0; li--) {
      const layer = this.layers[li];
      const prevAct = acts[li];
      const newDelta: number[] = new Array(prevAct.length).fill(0);

      for (let o = 0; o < layer.w.length; o++) {
        const grad = clamp(delta[o], -5, 5);
        // bias update (Adam)
        layer.mB[o] = b1 * layer.mB[o] + (1 - b1) * grad;
        layer.vB[o] = b2 * layer.vB[o] + (1 - b2) * grad * grad;
        const mHatB = layer.mB[o] / (1 - Math.pow(b1, this.step));
        const vHatB = layer.vB[o] / (1 - Math.pow(b2, this.step));
        layer.b[o] -= lr * mHatB / (Math.sqrt(vHatB) + eps);

        const row = layer.w[o];
        for (let k = 0; k < row.length; k++) {
          const g = grad * prevAct[k] + this.l2 * row[k];
          layer.mW[o][k] = b1 * layer.mW[o][k] + (1 - b1) * g;
          layer.vW[o][k] = b2 * layer.vW[o][k] + (1 - b2) * g * g;
          const mHat = layer.mW[o][k] / (1 - Math.pow(b1, this.step));
          const vHat = layer.vW[o][k] / (1 - Math.pow(b2, this.step));
          row[k] -= lr * mHat / (Math.sqrt(vHat) + eps);
          newDelta[k] += grad * row[k];
        }
      }

      // Backprop through ReLU of the previous (hidden) layer
      if (li > 0) {
        const zPrev = zs[li - 1];
        delta = newDelta.map((d, k) => d * reluDeriv(zPrev[k]));
      }
    }
    return loss;
  }

  /** Experience replay: re-train over stored buffer to retain past knowledge. */
  replay(epochs = 1, lr = this.lr): number {
    if (this.trainData.length < 8) return 0;
    let last = 0;
    for (let e = 0; e < epochs; e++) {
      const shuffled = [...this.trainData].sort(() => Math.random() - 0.5);
      for (const s of shuffled) last = this.train(s.f, s.l, lr);
    }
    return last;
  }

  /** Push a sample into the bounded experience buffer. */
  remember(features: number[], label: number) {
    this.trainData.push({ f: features, l: label });
    if (this.trainData.length > MAX_BUFFER) {
      this.trainData.splice(0, this.trainData.length - MAX_BUFFER);
    }
  }

  /** Accuracy over the stored experience buffer. */
  accuracy(): number {
    if (this.trainData.length === 0) return 0;
    let correct = 0;
    for (const s of this.trainData) {
      const p = this.predict(s.f);
      const pred = p.indexOf(Math.max(...p));
      if (pred === s.l) correct++;
    }
    return correct / this.trainData.length;
  }

  save() {
    try {
      const data: SerializedNN = {
        layout: this.layout,
        layers: this.layers.map((l) => ({ w: l.w, b: l.b })),
        trainData: this.trainData.slice(-MAX_BUFFER),
        step: this.step,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (_) {
      /* storage may be full or unavailable */
    }
  }

  load(): boolean {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const data: SerializedNN = JSON.parse(raw);
      if (!data.layers || JSON.stringify(data.layout) !== JSON.stringify(this.layout)) {
        return false;
      }
      data.layers.forEach((saved, i) => {
        if (this.layers[i]) {
          this.layers[i].w = saved.w;
          this.layers[i].b = saved.b;
        }
      });
      this.trainData = data.trainData || [];
      this.step = data.step || 0;
      return true;
    } catch (_) {
      return false;
    }
  }

  reset() {
    this.initLayers();
    this.trainData = [];
    this.step = 0;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {
      /* ignore */
    }
  }
}

/**
 * BAYES — a lightweight Bayesian win-probability memory keyed by a discretized
 * feature signature. Complements the neural net with an interpretable prior.
 */
const BAYES_KEY = 'gold_ai_bayes_v2';

export const BAYES = {
  signature(features: number[]): string {
    // Use the 6 most informative features, bucketed into 3 bins each.
    return features
      .slice(0, 6)
      .map((f) => (f > 0.33 ? 'H' : f < -0.33 ? 'L' : 'M'))
      .join('');
  },

  record(
    features: number[],
    won: boolean,
    mem: Record<string, { w: number; l: number }>
  ) {
    const sig = this.signature(features);
    if (!mem[sig]) mem[sig] = { w: 0, l: 0 };
    if (won) mem[sig].w++;
    else mem[sig].l++;
  },

  /** Laplace-smoothed posterior win probability for a feature signature. */
  probability(
    features: number[],
    mem: Record<string, { w: number; l: number }>
  ): number {
    const sig = this.signature(features);
    const e = mem[sig];
    if (!e) return 0.5;
    return (e.w + 1) / (e.w + e.l + 2);
  },

  load(): Record<string, { w: number; l: number }> {
    try {
      const raw = localStorage.getItem(BAYES_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  },

  save(mem: Record<string, { w: number; l: number }>) {
    try {
      localStorage.setItem(BAYES_KEY, JSON.stringify(mem));
    } catch (_) {
      /* ignore */
    }
  },
};
