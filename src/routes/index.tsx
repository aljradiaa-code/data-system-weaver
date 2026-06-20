import { createFileRoute } from "@tanstack/react-router";
import App from "@/gold/App";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Gold AI v2 — منصة الذهب الذكية" },
      { name: "description", content: "منصة تداول الذهب الذكية: محاكاة، شبكة عصبية، تحليل ICT/SMC." },
      { property: "og:title", content: "Gold AI v2 — منصة الذهب الذكية" },
      { property: "og:description", content: "منصة تداول الذهب الذكية: محاكاة، شبكة عصبية، تحليل ICT/SMC." },
    ],
  }),
  component: Index,
});

function Index() {
  return <App />;
}
