import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "@/app/page";

describe("HomePage", () => {
  it("renders commitment-focused copy", () => {
    render(<HomePage />);
    expect(screen.getByRole("heading", { name: /dating with clarity, not chaos/i })).toBeInTheDocument();
    expect(screen.getByText(/relationship-first experience/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create account/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /sign in/i })).toBeVisible();
  });
});
