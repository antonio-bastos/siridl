# SIRI-DL — Arquitetura Supabase PostgreSQL + PostGIS & Cloudflare R2

## 1. Separação de Responsabilidades
- **Supabase (PostgreSQL 17 + PostGIS 3.3):** Todos os dados estruturados, geometrias geoespaciais (`SRID 4326`), relações normalizadas, auditorias e referências/metadados de ficheiros (`media_assets`). **Nenhum binário ou `base64` é armazenado no PostgreSQL.**
- **Cloudflare R2 (bucket `siri-dl`):** Todos os ficheiros binários (fotografias de evidência, capturas ao vivo, amostras *hard-negative* de Active Learning em `retrain_dataset/`, imagem de referência `assets/reference.jpg`), servidos pelo proxy seguro `/api/media/[...key]` sem expor credenciais S3/R2 ao cliente.

## 2. Tabelas Criadas & Relações
| Tabela | Finalidade | Relações / Índices Principais |
|---|---|---|
| `public.schema_migrations` | Controlo de versões das migrações SQL | `version` PK |
| `public.caop_freguesias` | Polígonos oficiais CAOP 2025 das 11 freguesias de Loulé (`MultiPolygon`, 4326) | `freguesia` UNIQUE, índice `GIST(geom)` |
| `public.ip_rede_rodoviaria` | Troços da Rede Rodoviária Nacional (`roadnumber`, `gestao`, `n_vias`) | Índice `GIST(geom)` |
| `public.road_centerlines` | Eixos de via OSM para *map-matching* (`ST_ClosestPoint`) | `UNIQUE(street_name, parish)`, índice `GIST(geom)` |
| `public.sensitive_zones` | Escolas, hospitais, rotundas e passadeiras (buffer 100 m) | `name` UNIQUE, índice `GIST(geom)` |
| `public.media_assets` | Registo centralizado de objetos R2 (`bucket`, `object_key`, `mime_type`, `file_size`, `sha256`) | `object_key` UNIQUE, índice `(entity_type, entity_id)` |
| `public.road_anomalies` | Tabela unificada de ocorrências (`/map`, `/entradas`, `/participar`, `/captura`, `/detections`) | `anomaly_code` UNIQUE, `primary_asset_id -> media_assets(id)`, `GIST(geom)`, soft-delete `deleted_at` |
| `public.anomaly_evidence` | Relação 1-para-N entre ocorrências e múltiplas fotos de evidência | `anomaly_id -> road_anomalies(id) ON DELETE CASCADE`, `asset_id -> media_assets(id) ON DELETE CASCADE` |
| `public.sector_audits` | Setores e filtros guardados no painel cartográfico | `id` PK, soft-delete `deleted_at` |
| `public.active_learning_samples` | Registo de falsos positivos enviados para `retrain_dataset/` no R2 | `sample_id` UNIQUE, `asset_id -> media_assets(id)` |

## 3. Segurança & Row Level Security (RLS)
- Definida em `supabase/migrations/202611140002_rls_and_policies.sql`.
- RLS ativado em todas as 10 tabelas de `public`.
- `anon` e `authenticated`: apenas leitura (`SELECT`) em camadas de referência e registos ativos (`deleted_at IS NULL`).
- `active_learning_samples`: leitura restrita a `authenticated` e `service_role`.
- `service_role` (backend FastAPI e rotas API server-side do Next.js usando `SUPABASE_SECRET_KEY` / `DATABASE_URL`): acesso completo controlado no servidor.

## 4. Variáveis de Ambiente Necessárias (`.env.local` e `dashboard/.env.local`)
- `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` *(exclusivo servidor)*
- `DATABASE_URL` *(exclusivo servidor, `sslmode=require`)*
- `R2_BUCKET=siri-dl`, `R2_ENDPOINT_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PREFIX=retrain_dataset` *(exclusivo servidor)*

## 5. Migrações & Execução
1. Ordem das migrações SQL:
   - `supabase/migrations/202611140001_initial_schema.sql`
   - `supabase/migrations/202611140002_rls_and_policies.sql`
2. Executar migração completa e idempotente (schema + R2 + dados + reconciliação):
   ```powershell
   .\.venv\Scripts\python.exe scripts/migrate_to_supabase_r2.py <seed_export.json>
   ```
3. Para futuras migrações, adicionar um novo ficheiro `supabase/migrations/YYYYMMDDNNNN_<nome>.sql` com `INSERT INTO public.schema_migrations` e executar o mesmo fluxo.

## 6. Backups & Recuperação
- **PostgreSQL (Supabase):** Utilizar backups automáticos diários / Point-in-Time Recovery (PITR) no painel Supabase ou `pg_dump --format=custom "$DATABASE_URL" > backup_siridl.dump`.
- **Cloudflare R2:** Ativar *Object Versioning* no bucket `siri-dl` ou sincronizar com `rclone copy` para cópia secundária; todas as referências e hashes `sha256` ficam preservados em `public.media_assets`.
