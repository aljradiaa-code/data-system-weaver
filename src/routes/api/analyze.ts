import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

function buildPrompt(body: any): string {
  const last = (body.lastTrades ?? [])
    .map(
      (t: any) =>
        `- ${t.dir} @${t.entry} → ${t.status} (PnL ${t.pnl}$, R ${t.pnlR})`,
    )
    .join("\n");
  return [
    "أنت محلل تداول خبير في الذهب (XAUUSD) باستخدام منهجية ICT/SMC.",
    "حلّل أداء الاستراتيجية التالية بإيجاز ودقة، بالعربية، بنقاط واضحة:",
    `إجمالي الصفقات: ${body.stats?.totalTrades ?? "N/A"}`,
    `معدل النجاح: ${body.stats?.winRate ?? "N/A"}%`,
    `صافي الربح: ${body.stats?.pnl ?? "N/A"}$`,
    `Profit Factor: ${body.profitFactor ?? "N/A"}`,
    `Max Drawdown: ${body.maxDrawdown ?? "N/A"}`,
    `Expectancy (R): ${body.expectancyR ?? "N/A"}`,
    `Sharpe: ${body.sharpe ?? "N/A"}`,
    "آخر الصفقات:",
    last,
    "",
    "أعطِ: 1) قراءة سريعة للأداء  2) نقاط القوة  3) نقاط الضعف  4) توصيات عملية للتحسين.",
  ].join("\n");
}

export const Route = createFileRoute("/api/analyze")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) {
          return new Response(
            JSON.stringify({ error: "LOVABLE_API_KEY غير مضبوط. فعّل Lovable AI." }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
        try {
          const body = await request.json();
          const prompt = buildPrompt(body);
          const res = await fetch(
            "https://ai.gateway.lovable.dev/v1/chat/completions",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash",
                messages: [
                  { role: "system", content: "أنت محلل تداول محترف. أجب بالعربية بإيجاز." },
                  { role: "user", content: prompt },
                ],
              }),
            },
          );
          if (!res.ok) {
            const text = await res.text();
            return new Response(
              JSON.stringify({ error: `فشل الذكاء الاصطناعي: ${res.status} ${text.slice(0, 200)}` }),
              { status: 500, headers: { "Content-Type": "application/json" } },
            );
          }
          const data: any = await res.json();
          const analysis =
            data?.choices?.[0]?.message?.content ?? "لم يتم إنتاج تحليل.";
          return new Response(JSON.stringify({ analysis }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e: any) {
          return new Response(
            JSON.stringify({ error: e?.message ?? "خطأ غير متوقع." }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});