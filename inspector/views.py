import os
from django.http import JsonResponse, HttpResponseBadRequest
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.shortcuts import get_object_or_404
from .models import Dataset
from .services import DataProfile

_profiles_cache = {}

def _get_profile(pk: int) -> DataProfile:
    ds = get_object_or_404(Dataset, pk=pk)
    if pk not in _profiles_cache:
        _profiles_cache[pk] = DataProfile.from_csv(ds.file.path)
    return _profiles_cache[pk]

@csrf_exempt
@require_http_methods(["GET", "POST"])
def datasets(request):
    if request.method == "POST":
        f = request.FILES.get("file")
        name = request.POST.get("name") or (f.name if f else None)
        if not f or not name:
            return HttpResponseBadRequest("Missing file or name")

        mode = request.POST.get("mode", "auto")  # "auto" (default) | "replace" | "error"

        # Si pidieron reemplazar, actualiza el archivo del dataset existente
        if mode == "replace":
            existing = Dataset.objects.filter(name=name).first()
            if existing:
                # borra archivo previo para no dejar huérfanos
                if existing.file:
                    existing.file.delete(save=False)
                existing.file = f
                existing.save()
                # invalida cache para reprocesar
                _profiles_cache.pop(existing.pk, None)
                try:
                    f.close()
                except Exception:
                    pass
                return JsonResponse({"id": existing.pk, "name": existing.name, "replaced": True})

        # Si no reemplaza y el nombre existe, decide qué hacer
        if Dataset.objects.filter(name=name).exists():
            if mode == "error":
                return JsonResponse({"error": "Ya existe un dataset con ese nombre."}, status=409)
            # auto-rename: Nombre (2).ext, (3), ...
            base, ext = os.path.splitext(name)
            i = 2
            new_name = f"{base} ({i}){ext}"
            while Dataset.objects.filter(name=new_name).exists():
                i += 1
                new_name = f"{base} ({i}){ext}"
            name = new_name

        ds = Dataset.objects.create(name=name, file=f)
        try:
            f.close()  # libera el tmp inmediatamente
        except Exception:
            pass
        return JsonResponse({"id": ds.pk, "name": ds.name})

    # GET: lista datasets
    data = [{"id": d.pk, "name": d.name, "uploaded_at": d.uploaded_at.isoformat()}
            for d in Dataset.objects.order_by("-uploaded_at")]
    return JsonResponse({"datasets": data})
