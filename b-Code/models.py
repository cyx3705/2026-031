"""
首页 3D 展台的模型转换：STEP 装配 -> GLB。

STEP 只在本机的项目文件夹里有（各仓库的 b-Module-GE），Actions 拿不到，
（沙拉售卖机原本只有 Solid Edge 装配，b-Module-GE 里的 STEP 是用 Solid Edge 另存出来的）
所以这一步在本机手动跑，产物 b-Site/assets/models/<编号>.glb 直接入库。
要换模型或加模型：改下面的 MODELS，再在 site.config.json 的 showcase.models 里登记。

依赖：pip install cascadio（OpenCASCADE 的 STEP -> GLB，保留装配颜色）
用法：python b-Code/models.py
"""

import os
import shutil
import sys
import tempfile

import cascadio

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
# 各项目文件夹：与本站仓库同级的 HistoryClio，以及 HistoryVesta 里的老项目
PROJECTS = [os.path.dirname(ROOT), os.path.join(os.path.dirname(os.path.dirname(ROOT)), "HistorySaturn", "HistoryVesta")]
OUT = os.path.join(ROOT, "b-Site", "assets", "models")

# 编号 -> (项目文件夹下的 STEP 相对路径, 弦高公差 mm)
# 公差越大面越少、文件越小；整机展示 0.4~0.8 mm 已经看不出折线，大装配放宽到 1.5~3
MODELS = {
    "2026-012": ("2026-012-咖啡冷萃机/b-Module-GE/0-咖啡冷萃机-除板子外.stp", 0.4),
    "2025-004": ("2025-004-迎宾机器人/b-Module-GE/0000-1226.stp", 0.8),
    "2025-009": ("2025-009-沙拉售卖机/b-Module-GE/大型沙拉机.stp", 1.0),
    "2025-002": ("2025-002-小agv小车/b-Module-GE/0000-DJJ-12-5.stp", 0.8),
    "2025-008": ("2025-008-机器人手快换/b-Module-GE/Repaired_装配体-6.STEP", 0.2),
    "2025-010": ("2025-010-自动贴瓷砖机/b-Module-GE/2000-抬升机构.stp", 1.5),
}


def main():
    os.makedirs(OUT, exist_ok=True)
    only = set(sys.argv[1:])
    for mid, (rel, tol) in MODELS.items():
        if only and mid not in only:
            continue
        src = next((os.path.join(p, rel) for p in PROJECTS if os.path.exists(os.path.join(p, rel))), rel)
        dst = os.path.join(OUT, mid + ".glb")
        if not os.path.exists(src):
            print(f"  ! {mid} 找不到 {src}，跳过")
            continue
        # OpenCASCADE 在 Windows 上打不开含中文的路径，先倒到纯 ASCII 的临时目录里转
        with tempfile.TemporaryDirectory() as tmp:
            a = os.path.join(tmp, "in.stp")
            b = os.path.join(tmp, "out.glb")
            shutil.copyfile(src, a)
            if cascadio.step_to_glb(a, b, tol_linear=tol, tol_angular=0.5) != 0:
                print(f"  ! {mid} 转换失败")
                continue
            shutil.copyfile(b, dst)
        print(f"  ✓ {mid}  {os.path.getsize(dst) / 1e6:.1f} MB  <- {rel}")


if __name__ == "__main__":
    main()
