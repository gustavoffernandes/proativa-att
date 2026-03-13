import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const GOOGLE_SHEETS_API_KEY = Deno.env.get("GOOGLE_SHEETS_API_KEY");

  if (!GOOGLE_SHEETS_API_KEY) {
    return new Response(
      JSON.stringify({ error: "GOOGLE_SHEETS_API_KEY não configurada" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { config_id } = await req.json();
    if (!config_id) throw new Error("config_id é obrigatório");

    // Get config
    const { data: config, error: configError } = await supabase
      .from("google_forms_config")
      .select("*")
      .eq("id", config_id)
      .single();

    if (configError || !config) throw new Error("Configuração não encontrada");

    // Create sync log
    const { data: syncLog } = await supabase
      .from("sync_logs")
      .insert({ config_id, status: "running" })
      .select()
      .single();

    // Fetch Google Sheets data
    const sheetUrl = `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheet_id}/values/${encodeURIComponent(config.sheet_name)}?key=${GOOGLE_SHEETS_API_KEY}`;
    const sheetsResponse = await fetch(sheetUrl);

    if (!sheetsResponse.ok) {
      const errBody = await sheetsResponse.text();
      throw new Error(`Erro ao acessar Google Sheets [${sheetsResponse.status}]: ${errBody}`);
    }

    const sheetsData = await sheetsResponse.json();
    const rows = sheetsData.values || [];

    if (rows.length < 2) {
      const syncedAt = new Date().toISOString();

      await supabase
        .from("google_forms_config")
        .update({ last_sync_at: syncedAt })
        .eq("id", config_id);

      // Update sync log
      if (syncLog) {
        await supabase
          .from("sync_logs")
          .update({ status: "success", finished_at: syncedAt, rows_synced: 0 })
          .eq("id", syncLog.id);
      }

      return new Response(
        JSON.stringify({ rows_synced: 0, synced_at: syncedAt, message: "Nenhuma resposta encontrada" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const headers = rows[0] as string[];
    const dataRows = rows.slice(1);

    // Find column indices (flexible matching)
    const findCol = (keywords: string[]) =>
      headers.findIndex((h) =>
        keywords.some((k) => h.toLowerCase().includes(k.toLowerCase()))
      );

    const timestampCol = findCol(["carimbo", "timestamp", "data"]);
    const nameCol = findCol(["nome", "name"]);
    const ageCol = findCol(["idade", "age", "faixa"]);
    const sexCol = findCol(["sexo", "gênero", "genero", "sex", "gender"]);
    const sectorCol = findCol(["setor", "sector", "departamento", "área", "area"]);

    // All other columns are treated as question answers
    const metaCols = new Set([timestampCol, nameCol, ageCol, sexCol, sectorCol].filter((i) => i >= 0));

    const responses = dataRows.map((row: string[]) => {
      const answers: Record<string, string> = {};
      headers.forEach((header, idx) => {
        if (!metaCols.has(idx) && row[idx]) {
          answers[header] = row[idx];
        }
      });

      return {
        config_id,
        response_timestamp: timestampCol >= 0 && row[timestampCol] ? parseTimestamp(row[timestampCol]) : null,
        respondent_name: nameCol >= 0 ? row[nameCol] || null : null,
        age: ageCol >= 0 ? parseAge(row[ageCol]) : null,
        sex: sexCol >= 0 ? row[sexCol] || null : null,
        sector: sectorCol >= 0 ? row[sectorCol] || null : null,
        answers,
      };
    });

    // Delete existing responses for this config and re-insert
    await supabase.from("survey_responses").delete().eq("config_id", config_id);

    // Insert in batches of 500
    let totalSynced = 0;
    for (let i = 0; i < responses.length; i += 500) {
      const batch = responses.slice(i, i + 500);
      const { error: insertError } = await supabase.from("survey_responses").insert(batch);
      if (insertError) throw new Error(`Erro ao inserir respostas: ${insertError.message}`);
      totalSynced += batch.length;
    }

    // Update config last_sync_at
    await supabase
      .from("google_forms_config")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("id", config_id);

    // Update sync log
    if (syncLog) {
      await supabase
        .from("sync_logs")
        .update({ status: "success", finished_at: new Date().toISOString(), rows_synced: totalSynced })
        .eq("id", syncLog.id);
    }

    return new Response(
      JSON.stringify({ rows_synced: totalSynced }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Sync error:", error);

    // Try to log the error
    try {
      await supabase
        .from("sync_logs")
        .insert({ config_id: null, status: "error", error_message: (error as Error).message, finished_at: new Date().toISOString() });
    } catch (_) { /* ignore */ }

    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function parseTimestamp(value: string): string | null {
  if (!value) return null;
  // Try DD/MM/YYYY HH:MM:SS format (Brazilian)
  const brMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):?(\d{2})?/);
  if (brMatch) {
    const [, day, month, year, hour, min, sec] = brMatch;
    return new Date(+year, +month - 1, +day, +hour, +min, +(sec || 0)).toISOString();
  }
  // Fallback: try native parsing
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function parseAge(value: string | undefined): number | null {
  if (!value) return null;
  const num = parseInt(value, 10);
  return isNaN(num) ? null : num;
}
