import pandas as pd
import numpy as np
from dataclasses import dataclass
from typing import Dict, Any, List

@dataclass
class DataProfile:
    df: pd.DataFrame

    @staticmethod
    def from_csv(path: str, max_rows: int | None = None) -> "DataProfile":
        # try different separators quickly
        for sep in [",", ";", "\t", "|"]:
            try:
                df = pd.read_csv(path, sep=sep if sep != "\t" else "\t")
                break
            except Exception:
                df = None
        if df is None:
            # last attempt: let pandas auto-detect
            df = pd.read_csv(path)
        if max_rows:
            df = df.head(max_rows)
        return DataProfile(df)

    def overview(self) -> Dict[str, Any]:
        df = self.df
        mem = df.memory_usage(deep=True).sum()
        dup = df.duplicated().sum()
        missing_total = int(df.isna().sum().sum())
        return {
            "rows": int(len(df)),
            "columns": int(df.shape[1]),
            "memory_bytes": int(mem),
            "duplicate_rows": int(dup),
            "missing_total": missing_total,
            "missing_pct": float(missing_total / (df.size or 1) * 100.0),
        }

    def missing_by_col(self) -> List[Dict[str, Any]]:
        s = self.df.isna().sum()
        total = len(self.df)
        return [{"column": c, "missing": int(v), "missing_pct": float((v / (total or 1)) * 100.0)} for c, v in s.items()]

    def dtypes_summary(self) -> List[Dict[str, Any]]:
        out = []
        for c in self.df.columns:
            s = self.df[c]
            inferred = pd.api.types.infer_dtype(s, skipna=True)
            out.append({"column": c, "dtype": str(s.dtype), "inferred": inferred})
        return out

    def nunique_by_col(self) -> List[Dict[str, Any]]:
        s = self.df.nunique(dropna=True)
        return [{"column": c, "unique": int(v)} for c, v in s.items()]

    def columns(self) -> List[str]:
        return [str(c) for c in self.df.columns]

    def histogram(self, col: str, bins: int = 20) -> Dict[str, Any]:
        s = self.df[col]
        # numeric
        if pd.api.types.is_numeric_dtype(s):
            counts, edges = np.histogram(s.dropna(), bins=bins)
            return {"type": "numeric", "edges": edges.tolist(), "counts": counts.tolist()}
        # datetime
        if pd.api.types.is_datetime64_any_dtype(s) or pd.api.types.is_datetime64_dtype(s):
            # bin by month
            t = pd.to_datetime(s, errors="coerce").dropna()
            if t.empty:
                return {"type": "datetime", "labels": [], "counts": []}
            g = t.dt.to_period("M").value_counts().sort_index()
            return {"type": "datetime", "labels": g.index.astype(str).tolist(), "counts": g.values.tolist()}
        # categorical: top 20
        vc = s.astype(str).replace("nan", pd.NA).dropna().value_counts().head(20)
        return {"type": "categorical", "labels": vc.index.tolist(), "counts": vc.values.tolist()}

    def duplicates_sample(self, limit: int = 10) -> List[Dict[str, Any]]:
        dup_rows = self.df[self.df.duplicated(keep=False)]
        return dup_rows.head(limit).to_dict(orient="records")

    def corr_top_pairs(self, k: int = 20) -> List[Dict[str, Any]]:
        num_df = self.df.select_dtypes(include=[np.number])
        if num_df.shape[1] < 2:
            return []
        corr = num_df.corr(numeric_only=True)
        pairs = []
        cols = corr.columns
        for i in range(len(cols)):
            for j in range(i+1, len(cols)):
                v = corr.iloc[i, j]
                if pd.isna(v):
                    continue
                pairs.append({"a": cols[i], "b": cols[j], "corr": float(v)})
        pairs.sort(key=lambda d: abs(d["corr"]), reverse=True)
        return pairs[:k]
