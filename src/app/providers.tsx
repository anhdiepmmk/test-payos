"use client";

/**
 * TanStack Query provider — bắt buộc là client component rồi mới bọc vào layout.tsx.
 * refetchOnWindowFocus (mặc định bật) giúp UI tự cập nhật khi user quay lại tab —
 * cover luôn trường hợp "đóng modal rồi mới quét QR thanh toán".
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 3_000 },
        },
      }),
  );
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
