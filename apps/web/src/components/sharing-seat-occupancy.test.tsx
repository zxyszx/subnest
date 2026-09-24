import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SharingSeatOccupancy, sharingSeatExpiryTone } from "./sharing-seat-occupancy";

describe("SharingSeatOccupancy", () => {
  it("renders one segment per seat and marks occupied seats", () => {
    render(<SharingSeatOccupancy occupied={1} capacity={5} />);

    const occupancy = screen.getByLabelText("1 / 5");
    expect(occupancy).toHaveTextContent("1 / 5");
    expect(occupancy.querySelectorAll("[data-occupied='true']")).toHaveLength(1);
    expect(occupancy.querySelectorAll("[data-occupied='false']")).toHaveLength(4);
  });

  it("uses a compact progress bar for large capacities", () => {
    render(<SharingSeatOccupancy occupied={5} capacity={10} />);

    expect(screen.getByLabelText("5 / 10")).toHaveTextContent("5 / 10");
    expect(screen.getByTestId("sharing-seat-progress").firstElementChild).toHaveStyle({ transform: "scaleX(0.5)" });
  });

  it("colors each occupied seat from its own expiry urgency", () => {
    render(
      <SharingSeatOccupancy
        occupied={3}
        capacity={5}
        seatTones={["normal", "warning", "danger", "vacant", "vacant"]}
      />,
    );

    const occupancy = screen.getByLabelText("3 / 5");
    expect(occupancy.querySelectorAll("[data-tone='normal']")).toHaveLength(1);
    expect(occupancy.querySelectorAll("[data-tone='warning']")).toHaveLength(1);
    expect(occupancy.querySelectorAll("[data-tone='danger']")).toHaveLength(1);
    expect(occupancy.querySelectorAll("[data-tone='vacant']")).toHaveLength(2);
  });

  it("maps expiry dates to the agreed green, yellow, and red thresholds", () => {
    expect(sharingSeatExpiryTone(8)).toBe("normal");
    expect(sharingSeatExpiryTone(7)).toBe("warning");
    expect(sharingSeatExpiryTone(4)).toBe("warning");
    expect(sharingSeatExpiryTone(3)).toBe("danger");
    expect(sharingSeatExpiryTone(-1)).toBe("danger");
  });

  it("clamps invalid occupied values to the available capacity", () => {
    render(<SharingSeatOccupancy occupied={9} capacity={5} />);

    expect(screen.getByLabelText("5 / 5")).toBeInTheDocument();
  });
});
