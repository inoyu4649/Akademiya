import client from "./client";

/**
 * 업로드 파일을 인증·멤버십 검사 라우트(/api/files/:filename)를 통해 받아 저장한다.
 * 공개 정적 링크(/uploads/*)가 제거되었으므로(H-2/M-4) Bearer 토큰이 실리는
 * axios client 로 blob 을 받아 object URL 로 다운로드한다.
 *
 * @param fileUrl       DB 저장 형식의 경로 (예: "/uploads/123-abc.pdf")
 * @param originalName  저장 시 사용할 원본 파일명
 */
export async function downloadFile(fileUrl: string, originalName?: string): Promise<void> {
  const filename = fileUrl.split("/").pop() ?? "";
  const res = await client.get(`/files/${encodeURIComponent(filename)}`, {
    responseType: "blob",
  });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = originalName ?? filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
