export async function requestMessageDeletion(id: number): Promise<void> {
  const response = await fetch(`/api/messages/${id}`, { method: "DELETE" });

  if (!response.ok) {
    throw new Error(`DELETE /api/messages/${id} responded ${response.status}`);
  }
}
