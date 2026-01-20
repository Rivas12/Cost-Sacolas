import os
from functools import lru_cache
from supabase import create_client, Client


class SupabaseConfigError(RuntimeError):
    pass


@lru_cache(maxsize=1)
def get_client() -> Client:
    url = os.environ.get("SUPABASE_URL")
    key = (
        os.environ.get("SUPABASE_SERVICE_ROLE")
        or os.environ.get("SUPABASE_KEY")
        or os.environ.get("SUPABASE_ANON_KEY")
    )
    if not url or not key:
        raise SupabaseConfigError(
            "Defina SUPABASE_URL e SUPABASE_KEY (ou SUPABASE_SERVICE_ROLE / SUPABASE_ANON_KEY) no .env"
        )
    # A SDK do storage espera barra final; normalizamos para evitar warning
    normalized_url = url if url.endswith('/') else url + '/'
    return create_client(normalized_url, key)
