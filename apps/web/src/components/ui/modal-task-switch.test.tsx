import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "./alert-dialog";

function Tasks() {
  const [child, setChild] = useState(false);
  const [confirm, setConfirm] = useState(false);
  return <>
    <Dialog open>
      <DialogContent data-testid="parent-task">
        <DialogTitle>账户</DialogTitle><DialogDescription>管理成员</DialogDescription>
        <input aria-label="草稿" defaultValue="原始内容" />
        <button onClick={() => setChild(true)}>编辑车位</button>
      </DialogContent>
    </Dialog>
    <Dialog open={child} onOpenChange={setChild}>
      <DialogContent data-testid="child-task" closeLabel="返回账户">
        <DialogTitle>车位</DialogTitle><DialogDescription>编辑成员</DialogDescription>
        <button onClick={() => setConfirm(true)}>删除成员</button>
      </DialogContent>
    </Dialog>
    <AlertDialog open={confirm} onOpenChange={setConfirm}>
      <AlertDialogContent data-testid="confirmation-task">
        <AlertDialogTitle>删除确认</AlertDialogTitle><AlertDialogDescription>确认后删除</AlertDialogDescription>
        <AlertDialogCancel>返回车位</AlertDialogCancel>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}

describe("one task window at a time", () => {
  it("replaces parent surfaces and restores their drafts, scroll and focus on return", async () => {
    const user = userEvent.setup();
    render(<Tasks />);
    const parent = screen.getByTestId("parent-task");
    const draft = screen.getByRole("textbox", { name: "草稿" });
    await user.clear(draft);
    await user.type(draft, "保留未保存的修改");
    parent.scrollTop = 82;
    const edit = screen.getByRole("button", { name: "编辑车位" });
    await user.click(edit);
    expect(parent).toHaveAttribute("data-modal-suspended");
    expect(parent).toHaveAttribute("inert");
    const child = screen.getByTestId("child-task");
    expect(child).toHaveAttribute("data-modal-front");
    await user.click(screen.getByRole("button", { name: "删除成员" }));
    expect(child).toHaveAttribute("data-modal-suspended");
    expect(screen.getByTestId("confirmation-task")).toHaveAttribute("data-modal-front");
    expect(document.querySelectorAll("[data-modal-content][data-modal-front]")).toHaveLength(1);
    expect(document.querySelectorAll("[data-modal-overlay][data-modal-front]")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "返回车位" }));
    await waitFor(() => expect(child).toHaveAttribute("data-modal-front"));
    expect(parent).toHaveAttribute("data-modal-suspended");
    await user.click(screen.getByRole("button", { name: "返回账户" }));
    await waitFor(() => expect(parent).toHaveAttribute("data-modal-front"));
    expect(parent).not.toHaveAttribute("inert");
    expect(draft).toHaveValue("保留未保存的修改");
    expect(parent.scrollTop).toBe(82);
    await waitFor(() => expect(edit).toHaveFocus());
    await waitFor(() => expect(edit).toHaveFocus());
  });

  it("removes suspended windows during navigation without leaving an inert active window", () => {
    const rendered = render(<Tasks />);
    fireEvent.click(screen.getByRole("button", { name: "编辑车位" }));
    rendered.unmount();
    render(<Tasks />);
    expect(screen.getByTestId("parent-task")).toHaveAttribute("data-modal-front");
    expect(screen.getByTestId("parent-task")).not.toHaveAttribute("inert");
  });
});
