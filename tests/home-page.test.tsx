import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "@/app/page";

describe("HomePage", () => {
  it("renders commitment-focused copy", () => {
    render(<HomePage />);
    expect(screen.getByRole("heading", { name: /commitment match/i })).toBeInTheDocument();
    expect(screen.getByText(/calm, commitment-oriented platform/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create account/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /sign in/i })).toBeVisible();
  });
});
