"""
首页 3D 展台的模型转换：STEP 装配 -> GLB。

STEP 只在本机的项目文件夹里有（各仓库的 b-Module-GE），Actions 拿不到，
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
PROJECTS = os.path.dirname(ROOT)          # 各项目文件夹与本站仓库同级
OUT = os.path.join(ROOT, "b-Site", "assets", "models")

# 编号 -> (项目文件夹下的 STEP 相对路径, 弦高公差 mm)
# 公差越大面越少、文件越小；整机展示 0.4~0.8 mm 已经看不出折线
MODELS = {
    "2026-012": ("2026-012-咖啡冷萃机/b-Module-GE/0-咖啡冷萃机-除板子外.stp", 0.4),
    "2026-039": ("2026-039-环境检测机器人/b-Module-GE/0000-1226.stp", 0.8),
}


def main():
    os.makedirs(OUT, exist_ok=True)
    only = set(sys.argv[1:])
    for mid, (rel, tol) in MODELS.items():
        if only and mid not in only:
            continue
        src = os.path.join(PROJECTS, rel)
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
