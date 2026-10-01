"use client";

import { useState } from "react";
import { ApiError, createExpense, type Transaction } from "@/lib/api";
import { alertClasses, cardClass, inputClass, labelClass, primaryButtonClass } from "@/components/csmju/ui";

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
    <form onSubmit={handleSubmit} className={`${cardClass} p-5`}>
      <h2 className="mb-3 font-display text-headline-md text-on-surface">สร้างรายการเบิกจ่ายใหม่</h2>
      {error && <div className={`${alertClasses.error} mb-3`}>{error}</div>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label>
          <span className={labelClass}>จำนวนเงิน (บาท)</span>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`${inputClass} tabular-nums font-mono`}
            required
          />
        </label>
        <label>
          <span className={labelClass}>วันที่</span>
          <input
            type="date"
            value={transactionDate}
            onChange={(e) => setTransactionDate(e.target.value)}
            className={inputClass}
            required
          />
        </label>
        <label className="sm:col-span-2">
          <span className={labelClass}>รายละเอียด</span>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="เช่น ค่าอุปกรณ์กิจกรรมรับน้อง"
            className={inputClass}
            required
            maxLength={500}
          />
        </label>
        <label>
          <span className={labelClass}>หมวดหมู่ (ถ้ามี)</span>
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="เช่น SUPPLIES"
            className={inputClass}
            maxLength={100}
          />
        </label>
      </div>
      <p className="mt-3 text-caption text-on-surface-variant">
        รายการจะเข้าสถานะ &quot;รออนุมัติ&quot; — ต้องแนบหลักฐาน/บิลก่อนหัวหน้าสาขาจะอนุมัติได้
      </p>
      <div className="mt-4 flex justify-end">
        <button type="submit" disabled={submitting} className={primaryButtonClass}>
          {submitting ? "กำลังสร้าง..." : "สร้างรายการ"}
        </button>
      </div>
    </form>
  );
}
