import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import App from "./App";
import { MemoryRouter } from "react-router-dom";

vi.mock("./pages/ViewerPage", () => ({
  ViewerPage: () => <div data-testid="viewer-page">Viewer Page</div>,
}));

describe("App", () => {
  it("renders ViewerPage for root route", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("viewer-page")).toBeInTheDocument();
  });
});
