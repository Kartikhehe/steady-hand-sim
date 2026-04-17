import { createFileRoute } from "@tanstack/react-router";
import { SimulatorApp } from "@/components/sim/SimulatorApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MicroSteady · Tremor Cancellation Simulator" },
      {
        name: "description",
        content:
          "Interactive microsurgery tremor-cancellation simulator: PID + notch filtering of 8–12 Hz physiological hand tremor, controlled by your mouse.",
      },
      { property: "og:title", content: "MicroSteady · Tremor Cancellation Simulator" },
      {
        property: "og:description",
        content:
          "Move your mouse to perform virtual microsurgery while a PID + 2nd-order notch filter cancels simulated 8–12 Hz hand tremor in real time.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return <SimulatorApp />;
}
