/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * auditData.ts — Scientific audit of the original prototype and how v2 fixes it.
 */

import { AuditTopic } from './types';

export const auditData: AuditTopic[] = [
  {
    id: 1,
    title: 'إحصائيات أداء ثابتة (Hardcoded Metrics)',
    defect:
      "profitFactor و maxDrawdown كانت قيماً ثابتة مكتوبة يدوياً ('1.45', '4.8%') بدل حسابها من الصفقات الفعلية.",
    scientificSolution:
      'تم بناء دالة computeStats تحسب Profit Factor و Max Drawdown و Expectancy و Sharpe من سجل الصفقات الحقيقي لحظياً.',
    revampedCodeOutcome: 'مؤشرات حقيقية 100%',
  },
  {
    id: 2,
    title: 'عتبات ثابتة بالببس (Fixed Pip Thresholds)',
    defect:
      'المنطق الأصلي استخدم مسافات ثابتة للوقف/الهدف لا تتكيف مع تقلب الذهب.',
    scientificSolution:
      'تحويل كل العتبات إلى نسب من ATR (Average True Range) فتتكيف تلقائياً مع تقلب السوق.',
    revampedCodeOutcome: 'تكيف ديناميكي مع التقلب',
  },
  {
    id: 3,
    title: 'شبكة عصبية بلا ذاكرة حقيقية (No Experience Replay)',
    defect:
      'الشبكة كانت تتعلم من آخر صفقة فقط فتنسى الماضي (Catastrophic Forgetting).',
    scientificSolution:
      'إضافة Experience Replay Buffer + Adam Optimizer + Softmax/Cross-Entropy + L2 فتحفظ الماضي وتتعلم من الحاضر وتتنبأ بالمستقبل.',
    revampedCodeOutcome: 'تعلم مستقر ومتراكم',
  },
  {
    id: 4,
    title: 'بيانات غير متزامنة بين الأطر (Frame Desync)',
    defect:
      'توليد كل إطار زمني بشكل منفصل أدى إلى تناقض منطقي بين H4/H1/M15/M5.',
    scientificSolution:
      'توليد M5 كعملية أساسية واحدة ثم تجميعها (aggregate) لباقي الأطر فيضمن تطابقاً رياضياً تاماً.',
    revampedCodeOutcome: 'تزامن رياضي تام',
  },
  {
    id: 5,
    title: 'مفتاح API مكشوف (API Key Exposure)',
    defect: 'مفتاح Gemini كان معرضاً للكشف في الواجهة الأمامية.',
    scientificSolution:
      'تحويل نداء Gemini إلى خادم Express (api/analyze) بحيث يبقى المفتاح في متغير بيئة على الخادم فقط.',
    revampedCodeOutcome: 'أمان على مستوى الخادم',
  },
];
