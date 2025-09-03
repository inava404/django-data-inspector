from django.urls import path
from . import views

urlpatterns = [
    path('datasets/', views.datasets, name='datasets'),
    path('datasets/<int:pk>/', views.dataset_detail, name='dataset_detail'),
    path('datasets/<int:pk>/summary/', views.summary, name='summary'),
    path('datasets/<int:pk>/missing/', views.missing, name='missing'),
    path('datasets/<int:pk>/duplicates/', views.duplicates, name='duplicates'),
    path('datasets/<int:pk>/dtypes/', views.dtypes, name='dtypes'),
    path('datasets/<int:pk>/nunique/', views.nunique, name='nunique'),
    path('datasets/<int:pk>/columns/', views.columns, name='columns'),
    path('datasets/<int:pk>/histogram/', views.histogram, name='histogram'),
    path('datasets/<int:pk>/corr/', views.corr_pairs, name='corr_pairs'),
    path('datasets/<int:pk>/head/', views.head, name='head'),
]
