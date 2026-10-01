import { EmptyState } from "@/components/csmju/EmptyState";

export default function NotFound() {
  return (
    <EmptyState
      title="ไม่พบข้อมูลที่คุณกำลังค้นหา"
      description="อาจถูกลบไปแล้วหรือลิงก์ไม่ถูกต้อง"
    />
  );
}
