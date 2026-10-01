"use client";

import { Modal } from "./Modal";
import { dangerButtonClass, secondaryButtonClass } from "./ui";

interface Props {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** Generic destructive-action confirmation dialog, built on Modal. */
export function ConfirmDeleteModal({
  open,
  title,
  description,
  confirmLabel = "ยืนยัน",
  busy = false,
  onConfirm,
  onClose,
}: Props) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={secondaryButtonClass}>
            ยกเลิก
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} className={dangerButtonClass}>
            {busy ? "กำลังดำเนินการ..." : confirmLabel}
          </button>
        </>
      }
    >
      <p>{description}</p>
    </Modal>
  );
}
