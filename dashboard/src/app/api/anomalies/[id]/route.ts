import { NextRequest, NextResponse } from "next/server";
import { softDeleteRoadAnomaly, updateRoadAnomalyStatus } from "@/lib/supabase-server";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    const body = await req.json();
    const estado = body.estado as "Pendente" | "Agendado" | "Em Reparação" | "Resolvido";
    const updated = await updateRoadAnomalyStatus(id, estado);
    if (!updated) {
      return NextResponse.json({ detail: "Registo não encontrado." }, { status: 404 });
    }
    return NextResponse.json({ status: "ok", anomaly_code: updated.anomaly_code, estado: updated.repair_status });
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Erro ao atualizar estado." },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    const ok = await softDeleteRoadAnomaly(id);
    if (!ok) {
      return NextResponse.json({ detail: "Registo não encontrado." }, { status: 404 });
    }
    return NextResponse.json({ status: "deleted", anomaly_code: id });
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Erro ao remover registo." },
      { status: 400 },
    );
  }
}
