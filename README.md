# Data Inspector (Django)

Dashboard minimalista para perfilar datasets y decidir su tratamiento (nulos, duplicados, tipos, etc.).
- Backend: Django + DRF + pandas
- Frontend: HTML + Tailwind + Chart.js (fetch a endpoints en tiempo real)
- Soporta **cambiar el dataset** vía carga de CSV sin romper la funcionalidad.

## Endpoints
- `POST /api/datasets/` (multipart): `file` (CSV), `name` (texto) → crea/selecciona dataset
- `GET /api/datasets/` → lista datasets (más reciente primero)
- `GET /api/datasets/<id>/summary/`
- `GET /api/datasets/<id>/missing/`
- `GET /api/datasets/<id>/duplicates/`
- `GET /api/datasets/<id>/dtypes/`
- `GET /api/datasets/<id>/nunique/`
- `GET /api/datasets/<id>/columns/`
- `GET /api/datasets/<id>/histogram/?col=<nombre>&bins=20`
- `GET /api/datasets/<id>/corr/`
- `GET /api/datasets/<id>/head/?n=7`

## Desarrollo local
```bash
python -m venv .venv
source .venv/bin/activate  # en Windows: .venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
# cargar dataset de ejemplo en el admin o via API:
python manage.py createsuperuser
python manage.py runserver
```
Abrir http://127.0.0.1:8000/ y subir un CSV en la parte superior.

Subir CSV por API (ejemplo con curl):
```bash
curl -F "name=ventas_q1" -F "file=@media/datasets/sample.csv" http://127.0.0.1:8000/api/datasets/
```

## Deploy rápido en Render
1. Subir el repo a GitHub.
2. En Render → New Web Service → desde el repo.
3. Seleccionar **Python**, añadir variable `SECRET_KEY` y dejar el resto con defaults de `render.yaml`.
4. Render ejecutará `migrate`, `collectstatic` y levantará Gunicorn.

## Notas
- El cache de perfiles vive en memoria del proceso (`_profiles_cache`). Si se reemplaza un archivo, conviene reiniciar el dyno/servicio o invalidar manualmente el cache si se extiende.
- Para archivos grandes, considere stream processing o muestreos.
- Si su dataset no es CSV, adapte `DataProfile.from_csv` para otros formatos.
