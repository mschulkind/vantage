import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SettingsDropdown } from "./SettingsDropdown";

describe("SettingsDropdown", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
    localStorage.clear();
  });

  it("renders settings button", () => {
    render(
      <SettingsDropdown
        showEmptyDirs={true}
        onShowEmptyDirsChange={vi.fn()}
        keyboardShortcutsEnabled={true}
        onKeyboardShortcutsEnabledChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Settings")).toBeInTheDocument();
  });

  it("opens dropdown on click", () => {
    render(
      <SettingsDropdown
        showEmptyDirs={true}
        onShowEmptyDirsChange={vi.fn()}
        keyboardShortcutsEnabled={true}
        onKeyboardShortcutsEnabledChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("Settings"));
    expect(screen.getByText("Theme")).toBeInTheDocument();
    expect(screen.getByText("Keyboard")).toBeInTheDocument();
    expect(screen.getByText("File Tree")).toBeInTheDocument();
    expect(screen.getByText("Show all folders")).toBeInTheDocument();
    expect(screen.getByText("Enable shortcuts")).toBeInTheDocument();
  });

  it("toggles show empty dirs", () => {
    const onChange = vi.fn();
    render(
      <SettingsDropdown
        showEmptyDirs={false}
        onShowEmptyDirsChange={onChange}
        keyboardShortcutsEnabled={true}
        onKeyboardShortcutsEnabledChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("Settings"));
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("switches to dark theme", () => {
    render(
      <SettingsDropdown
        showEmptyDirs={true}
        onShowEmptyDirsChange={vi.fn()}
        keyboardShortcutsEnabled={true}
        onKeyboardShortcutsEnabledChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("Settings"));
    fireEvent.click(screen.getByText("Dark"));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("vantage:theme")).toBe("dark");
  });

  it("switches to light theme", () => {
    document.documentElement.classList.add("dark");
    localStorage.setItem("vantage:theme", "dark");
    render(
      <SettingsDropdown
        showEmptyDirs={true}
        onShowEmptyDirsChange={vi.fn()}
        keyboardShortcutsEnabled={true}
        onKeyboardShortcutsEnabledChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("Settings"));
    fireEvent.click(screen.getByText("Light"));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem("vantage:theme")).toBe("light");
  });

  it("closes on Escape", () => {
    render(
      <SettingsDropdown
        showEmptyDirs={true}
        onShowEmptyDirsChange={vi.fn()}
        keyboardShortcutsEnabled={true}
        onKeyboardShortcutsEnabledChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("Settings"));
    expect(screen.getByText("Theme")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Theme")).not.toBeInTheDocument();
  });

  it("toggles keyboard shortcuts setting", () => {
    const onKeyboardShortcutsEnabledChange = vi.fn();
    render(
      <SettingsDropdown
        showEmptyDirs={true}
        onShowEmptyDirsChange={vi.fn()}
        keyboardShortcutsEnabled={false}
        onKeyboardShortcutsEnabledChange={onKeyboardShortcutsEnabledChange}
      />,
    );
    fireEvent.click(screen.getByLabelText("Settings"));
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);
    expect(onKeyboardShortcutsEnabledChange).toHaveBeenCalledWith(true);
  });
});
