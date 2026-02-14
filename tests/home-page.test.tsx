import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "@/app/page";

describe("HomePage", () => {
  it("renders commitment-focused copy", () => {
    render(<HomePage />);
    expect(screen.getByRole("heading", { name: /commitment match mvp/i })).toBeInTheDocument();
    expect(screen.getByText(/14-day structured self-reflection/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /commitment onboarding/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue/i })).toBeVisible();
  });
});
