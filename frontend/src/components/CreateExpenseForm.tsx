"use client";

import { useState } from "react";
import { ApiError, createExpense, type Transaction } from "@/lib/api";

interface Props {
  externalUserId: string;
  yearAccountId: string;
  onCreated: (transaction: Transaction) => void;
}

export function CreateExpenseForm({ externalUserId, yearAccountId, onCreated }: Props) {
  const [amount, setAmount] = useState("");
  const [transactionDate, setTransactionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const created = await createExpense(externalUserId, {
        yearAccountId,
        amount: Number(amount),
        transactionDate,
        description,
        category: category || undefined,
      });
      onCreated(created);
      setAmount("");
      setDescription("");
      setCategory("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "สร้างรายการไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 rounded-passbook border-2 border-jade bg-jadeSoft p-4"
    >
      <h2 className="mb-3 font-display text-lg font-semibold text-ink">สร้างรายการเบิกจ่ายใหม่</h2>
      {error && <p className="mb-3 rounded bg-rustSoft p-2 text-sm text-rust">{error}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-sm text-inkFaint">
          จำนวนเงิน (บาท)
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-full rounded border border-paperLine bg-white px-2 py-1.5 font-mono text-ink"
            required
          />
        </label>
        <label className="text-sm text-inkFaint">
          วันที่
          <input
            type="date"
            value={transactionDate}
            onChange={(e) => setTransactionDate(e.target.value)}
            className="mt-1 w-full rounded border border-paperLine bg-white px-2 py-1.5 text-ink"
            required
          />
        </label>
        <label className="text-sm text-inkFaint sm:col-span-2">
          รายละเอียด
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="เช่น ค่าอุปกรณ์กิจกรรมรับน้อง"
            className="mt-1 w-full rounded border border-paperLine bg-white px-2 py-1.5 text-ink"
            required
            maxLength={500}
          />
        </label>
        <label className="text-sm text-inkFaint">
          หมวดหมู่ (ถ้ามี)
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="เช่น SUPPLIES"
            className="mt-1 w-full rounded border border-paperLine bg-white px-2 py-1.5 text-ink"
            maxLength={100}
          />
        </label>
      </div>
      <p className="mt-3 text-xs text-inkFaint">
        รายการจะเข้าสถานะ &quot;รออนุมัติ&quot; — ต้องแนบหลักฐาน/บิลก่อนหัวหน้าสาขาจะอนุมัติได้
      </p>
      <button
        type="submit"
        disabled={submitting}
        className="mt-3 rounded-full bg-jade px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {submitting ? "กำลังสร้าง..." : "สร้างรายการ"}
      </button>
    </form>
  );
}
