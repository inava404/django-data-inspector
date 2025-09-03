from django.core.management.base import BaseCommand
from django.core.files.base import ContentFile
from inspector.models import Dataset

SAMPLE = b"""id,name,age,city,income,joined_at
1,Ana,28,Mexico City,35000,2022-01-15
2,Carlos,35,Guadalajara,42000,2021-11-02
3,Luisa,,Monterrey,50000,2023-05-10
4,Pedro,28,Mexico City,35000,2022-01-15
5,,42,Puebla,,2020-07-21
6,Ana,28,Mexico City,35000,2022-01-15
7,María,31,Querétaro,47000,2024-03-12
"""

class Command(BaseCommand):
    help = "Carga un dataset de ejemplo"

    def handle(self, *args, **kwargs):
        if Dataset.objects.exists():
            self.stdout.write(self.style.WARNING("Ya hay datasets, no se hizo nada."))
            return
        ds = Dataset(name="sample.csv")
        ds.file.save("sample.csv", ContentFile(SAMPLE))
        ds.save()
        self.stdout.write(self.style.SUCCESS(f"Dataset de ejemplo creado con id={ds.pk}"))
