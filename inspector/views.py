import json
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
        ds = Dataset.objects.create(name=name, file=f)
        
        try:
            f.close()  # TemporaryUploadedFile.close() elimina el archivo del TMP
        except Exception:
            pass
        # warm cache lazily
        return JsonResponse({"id": ds.pk, "name": ds.name})

    # GET list
    data = [{"id": d.pk, "name": d.name, "uploaded_at": d.uploaded_at.isoformat()} for d in Dataset.objects.order_by("-uploaded_at")]
    return JsonResponse({"datasets": data})

@require_http_methods(["GET"])
def dataset_detail(request, pk: int):
    ds = get_object_or_404(Dataset, pk=pk)
    return JsonResponse({"id": ds.pk, "name": ds.name, "uploaded_at": ds.uploaded_at.isoformat()})

@require_http_methods(["GET"])
def summary(request, pk: int):
    p = _get_profile(pk)
    return JsonResponse(p.overview())

@require_http_methods(["GET"])
def missing(request, pk: int):
    p = _get_profile(pk)
    return JsonResponse({"missing_by_column": p.missing_by_col()})

@require_http_methods(["GET"])
def duplicates(request, pk: int):
    p = _get_profile(pk)
    return JsonResponse({"duplicates_sample": p.duplicates_sample(), "count": p.overview()["duplicate_rows"]})

@require_http_methods(["GET"])
def dtypes(request, pk: int):
    p = _get_profile(pk)
    return JsonResponse({"dtypes": p.dtypes_summary()})

@require_http_methods(["GET"])
def nunique(request, pk: int):
    p = _get_profile(pk)
    return JsonResponse({"nunique": p.nunique_by_col()})

@require_http_methods(["GET"])
def columns(request, pk: int):
    p = _get_profile(pk)
    return JsonResponse({"columns": p.columns()})

@require_http_methods(["GET"])
def histogram(request, pk: int):
    col = request.GET.get("col")
    bins = int(request.GET.get("bins", 20))
    if not col:
        return HttpResponseBadRequest("Missing col")
    p = _get_profile(pk)
    if col not in p.df.columns:
        return HttpResponseBadRequest("Unknown column")
    return JsonResponse(p.histogram(col, bins))

@require_http_methods(["GET"])
def corr_pairs(request, pk: int):
    p = _get_profile(pk)
    k = int(request.GET.get("k", 20))
    return JsonResponse({"pairs": p.corr_top_pairs(k)})

@require_http_methods(["GET"])
def head(request, pk: int):
    p = _get_profile(pk)
    n = int(request.GET.get("n", 5))
    return JsonResponse({"head": p.df.head(n).to_dict(orient="records")})
