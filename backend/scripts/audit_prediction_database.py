"""Read-only inventory of the existing Supabase architecture; no observation export.

Use --credential-file with a private secret file or SUPABASE_DB_READONLY_URL.
Outputs schema metadata and aggregate statistics only. Never prints the DSN.
Requires psycopg[binary] in the audit environment.
"""
import argparse
import datetime
import json
import os
from pathlib import Path

import psycopg
from psycopg import sql
from psycopg.rows import dict_row


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--credential-file', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--only', nargs='+', help='Refresh selected queries in an existing audit report')
    args = parser.parse_args()
    dsn = args.credential_file.read_text().strip() if args.credential_file else os.environ['SUPABASE_DB_READONLY_URL']
    report = {'audited_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'queries': {}}
    if args.only:
        report = json.loads(args.output.read_text(encoding='utf-8'))
        report['last_refreshed_at'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    with psycopg.connect(dsn, sslmode='require', connect_timeout=15, row_factory=dict_row) as conn:
        conn.read_only = True

        def query(name, statement, params=None):
            if args.only and name not in args.only:
                cached = report['queries'].get(name, [])
                return cached if isinstance(cached, list) else []
            try:
                with conn.transaction():
                    with conn.cursor() as cursor:
                        cursor.execute('SET LOCAL statement_timeout=45000')
                        cursor.execute(statement, params)
                        rows = cursor.fetchall()
                report['queries'][name] = rows
                report.setdefault('query_completed_at', {})[name] = datetime.datetime.now(datetime.timezone.utc).isoformat()
                print(name, 'OK', len(rows), flush=True)
                return rows
            except psycopg.Error as exc:
                report['queries'][name] = {'error_type': type(exc).__name__, 'sqlstate': exc.sqlstate}
                print(name, 'FAILED', type(exc).__name__, flush=True)
                return []

        report['client_tls'] = conn.pgconn.ssl_in_use
        query('session', "SELECT current_setting('transaction_read_only') AS read_only, current_setting('TimeZone') AS timezone, rolbypassrls, rolsuper FROM pg_roles WHERE rolname=current_user")
        query('schemas', "SELECT schema_name FROM information_schema.schemata ORDER BY 1")
        tables = query('relations', "SELECT c.relname AS name,c.relkind,c.relrowsecurity AS rls,c.relforcerowsecurity AS force_rls,c.reltuples::bigint AS estimated_rows,has_table_privilege(c.oid,'SELECT') AS can_read,has_table_privilege(c.oid,'INSERT') AS can_insert FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m') ORDER BY 1")
        query('columns', "SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")
        query('constraints', "SELECT c.conrelid::regclass::text AS relation,c.conname,c.contype,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' ORDER BY 1,2")
        query('indexes', "SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY 1,2")
        query('policies', "SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname IN ('public','storage') ORDER BY 1,2,3")
        query('views', "SELECT table_name,view_definition FROM information_schema.views WHERE table_schema='public' ORDER BY 1")
        query('geometry', 'SELECT f_table_schema,f_table_name,f_geometry_column,coord_dimension,srid,type FROM extensions.geometry_columns')
        for table in tables:
            if table['relkind'] in ('r', 'p') and table['name'] != 'audit_logs':
                query('count_' + table['name'], sql.SQL('SELECT count(*) AS records FROM public.{}').format(sql.Identifier(table['name'])))
        query('datasets', "SELECT d.dataset_id,d.dataset_code,d.dataset_name,s.source_code,s.organization,d.status,d.spatial_resolution,d.temporal_resolution,d.coverage_start,d.coverage_end FROM public.datasets d JOIN public.data_sources s USING(source_id) ORDER BY 1")
        query('variables', 'SELECT variable_id,variable_code,variable_name,data_kind,is_predictable,default_unit_id FROM public.ref_environmental_variables ORDER BY 1')
        query('units', 'SELECT unit_id,unit_code,symbol,dimension FROM public.ref_units ORDER BY 1')
        query('dataset_variables', 'SELECT * FROM public.dataset_variables ORDER BY dataset_id,variable_id')
        query('versions', 'SELECT dataset_version_id,dataset_id,version_label,release_date,retrieved_at,checksum FROM public.dataset_versions ORDER BY 1')
        query('regions', "SELECT region_id,region_code,region_name,region_type,extensions.ST_SRID(boundary) AS srid,extensions.ST_IsValid(boundary) AS valid_geometry FROM public.geo_regions ORDER BY 1")
        query('observation_coverage', """SELECT o.dataset_id,d.dataset_code,v.variable_code,u.unit_code,o.spatial_resolution_m,
            count(*) AS records,min(o.observed_at) AS first_observed,max(o.observed_at) AS last_observed,
            count(DISTINCT o.observed_at) AS timestamps,count(DISTINCT o.grid_id) AS grid_ids,count(DISTINCT o.region_id) AS regions,
            count(*) FILTER (WHERE o.value_numeric IS NULL) AS null_numeric,
            count(*) FILTER (WHERE o.location IS NULL) AS null_location,
            count(*) FILTER (WHERE o.grid_id IS NULL) AS null_grid,
            count(*) FILTER (WHERE o.dataset_version_id IS NULL) AS null_version,
            count(*) FILTER (WHERE o.quality_score IS NULL) AS null_quality_score,
            min(o.value_numeric) AS minimum,max(o.value_numeric) AS maximum,
            min(o.ingested_at) AS first_ingested,max(o.ingested_at) AS last_ingested,
            array_agg(DISTINCT o.quality_flag) AS quality_flags
            FROM public.environmental_observations o JOIN public.datasets d USING(dataset_id)
            JOIN public.ref_environmental_variables v USING(variable_id) LEFT JOIN public.ref_units u USING(unit_id)
            GROUP BY o.dataset_id,d.dataset_code,v.variable_code,u.unit_code,o.spatial_resolution_m ORDER BY 1,3""")
        query('time_steps', """WITH times AS (SELECT DISTINCT dataset_id,variable_id,grid_id,region_id,observed_at FROM public.environmental_observations),
            steps AS (SELECT dataset_id,variable_id,extract(epoch FROM observed_at-lag(observed_at) OVER (PARTITION BY dataset_id,variable_id,grid_id,region_id ORDER BY observed_at)) AS seconds FROM times)
            SELECT dataset_id,variable_id,seconds,count(*) AS occurrences FROM steps WHERE seconds IS NOT NULL GROUP BY 1,2,3 ORDER BY 1,2,3""")
        query('duplicate_keys', """SELECT dataset_id,variable_id,count(*) AS duplicate_groups,sum(n-1) AS extra_records FROM (
            SELECT dataset_id,variable_id,grid_id,region_id,observed_at,location::text,count(*) AS n FROM public.environmental_observations
            GROUP BY 1,2,3,4,5,6 HAVING count(*)>1) a GROUP BY 1,2""")
        query('metadata_keys', "SELECT DISTINCT key FROM public.environmental_observations o CROSS JOIN LATERAL jsonb_object_keys(o.metadata) key ORDER BY 1")
        query('observation_geography', "SELECT dataset_id,extensions.ST_SRID(location::extensions.geometry) AS srid,extensions.ST_Extent(location::extensions.geometry)::text AS extent,count(DISTINCT location::text) AS locations FROM public.environmental_observations GROUP BY 1,2 ORDER BY 1")
        query('semantic_coverage', """SELECT dataset_id,variable_id,metadata->>'source_parameter' AS source_parameter,
            metadata->>'native_variable' AS native_variable,metadata->>'record_kind' AS record_kind,
            metadata->>'temporal' AS temporal,metadata->>'native_temporal_resolution' AS native_temporal_resolution,
            metadata->>'native_unit' AS native_unit,metadata->>'original_unit' AS original_unit,
            metadata->>'normalized_unit' AS normalized_unit,metadata->>'imerg_run' AS imerg_run,
            count(*) AS records,count(DISTINCT observed_at) AS timestamps,
            min(observed_at) AS earliest,max(observed_at) AS latest
            FROM public.environmental_observations GROUP BY 1,2,3,4,5,6,7,8,9,10,11 ORDER BY 1,2,3""")
        query('semantic_duplicates', """SELECT count(*) AS duplicate_groups,coalesce(sum(n-1),0) AS extra_records FROM (
            SELECT count(*) AS n FROM public.environmental_observations GROUP BY dataset_id,variable_id,grid_id,
            observed_at,location::text,metadata->>'source_parameter',metadata->>'native_variable',metadata->>'temporal',
            metadata->>'record_kind',metadata->>'forecast_init_time' HAVING count(*)>1) x""")
        query('bbmp_points', """SELECT o.dataset_id,count(*) AS point_records_inside_bbmp,count(DISTINCT o.grid_id) AS point_grids
            FROM public.environmental_observations o JOIN public.geo_regions r ON r.region_code='IN-KA-BLR-BBMP'
            WHERE extensions.ST_Covers(r.boundary,o.location::extensions.geometry) GROUP BY 1 ORDER BY 1""")
        query('forecast_timing', """SELECT dataset_id,metadata->>'forecast_init_time' AS initialization,
            min(observed_at) AS first_target,max(observed_at) AS last_target,
            min((metadata->>'forecast_horizon_hours')::numeric) AS min_horizon,
            max((metadata->>'forecast_horizon_hours')::numeric) AS max_horizon,
            count(*) FILTER (WHERE observed_at < (metadata->>'forecast_init_time')::timestamptz) AS target_before_initialization,
            count(*) AS records FROM public.environmental_observations
            WHERE metadata->>'record_kind'='forecast' GROUP BY 1,2 ORDER BY 1,2""")
        query('source_lineage', """SELECT dataset_id,metadata->>'product_short_name' AS product,
            metadata->>'dataset_short_name' AS dataset_short_name,metadata->>'provider' AS provider,
            metadata->>'processing_pipeline' AS pipeline,metadata->>'quantity_type' AS quantity_type,
            metadata->>'data_type' AS data_type,metadata->>'derivation_note' AS derivation_note,
            count(*) AS records FROM public.environmental_observations GROUP BY 1,2,3,4,5,6,7,8 ORDER BY 1""")
        query('buckets', 'SELECT id,name,public,file_size_limit,allowed_mime_types FROM storage.buckets ORDER BY id')
        query('stored_object_counts', 'SELECT bucket_id,count(*) AS objects,min(created_at) AS first_created,max(created_at) AS last_created FROM storage.objects GROUP BY bucket_id ORDER BY 1')
        query('asset_inventory', 'SELECT storage_bucket,file_format,count(*) AS assets,min(temporal_start) AS earliest,max(temporal_end) AS latest FROM public.geospatial_assets GROUP BY 1,2 ORDER BY 1,2')
        query('models', 'SELECT model_id,model_code,model_type,algorithm,version,status,training_dataset_ids,artifact_bucket,artifact_path FROM public.model_registry ORDER BY 1')
        query('quality_summary', 'SELECT dataset_id,overall_status,count(*) AS reports,min(completeness_pct) AS min_completeness,max(completeness_pct) AS max_completeness FROM public.quality_reports GROUP BY 1,2')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, default=str), encoding='utf-8')
    print('Audit report saved; no database writes performed.')


if __name__ == '__main__':
    try:
        main()
    except psycopg.Error as exc:
        raise SystemExit(f'Database audit failed: {type(exc).__name__}; SQLSTATE={exc.sqlstate}. Credentials are not logged.') from None
