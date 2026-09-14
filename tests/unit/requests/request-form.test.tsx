import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RequestForm } from "@/components/requests/request-form";

vi.mock("@/actions/requests", () => ({
  createContentRequestAction: vi.fn(async () => ({ ok: true, data: { requestId: "r1" } })),
}));

describe("RequestForm", () => {
  it("shows topic as the only required field, with everything else under optional context", () => {
    render(<RequestForm />);

    expect(screen.getByLabelText(/topic/i)).toBeRequired();
    expect(screen.getByRole("button", { name: /optional context/i })).toBeInTheDocument();

    // Optional fields are not visible until the section is expanded.
    expect(screen.queryByLabelText(/audience/i)).not.toBeInTheDocument();
  });

  it("shows the resolved defaults that will be used when optional fields are left blank", () => {
    render(<RequestForm />);
    expect(screen.getByText(/defaults that will be used/i)).toBeInTheDocument();
    expect(screen.getByText(/educate and build authority/i)).toBeInTheDocument();
  });

  it("updates the shown default to the typed value once the user fills an optional field", async () => {
    const user = userEvent.setup();
    render(<RequestForm />);

    await user.click(screen.getByRole("button", { name: /optional context/i }));
    await user.type(screen.getByLabelText(/audience/i), "HR leaders");

    expect(screen.getAllByText(/hr leaders/i).length).toBeGreaterThan(0);
  });
});
