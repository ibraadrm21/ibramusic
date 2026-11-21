import { Component, type ReactNode } from "react";

export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="mx-auto max-w-lg p-8 text-white">
        <h1 className="mb-3 text-xl font-semibold">No se pudo cargar IbraMusic</h1>
        <button className="rounded-xl bg-white px-4 py-2 font-semibold text-black" onClick={() => window.location.reload()}>
          Volver a cargar
        </button>
      </main>
    );
  }
}
