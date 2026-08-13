# Cesium 大气散射+光照效果

## 目标

从太空视角观察地球边缘大气, 随相机视角和太阳位置变化呈现接近真实的 Rayleigh / Mie 散射(白昼蓝色气辉, 晨昏线橙红色). 场景中放置 ISS entity, Cesium 以设备像素高清渲染.

## 技术方案

- 使用Vite+React+Cesium方式

- 开源 Cesium 实现调研

CesiumJS 本身已包含开源大气散射, 效果不理想,查找第3方开源

参考: takram-design-engineering/three-geospatial packages/atmosphere

https://github.com/takram-design-engineering/three-geospatial/tree/b629cac68a3473e0ecef853bef92ee30b0b5a620/packages/atmosphere

该包是 Eric Bruneton Precomputed Atmospheric Scattering 的 Three.js 实现, 使用预计算 LUT 和多次散射, 视觉上比 Cesium 单次散射更接近照片(尤其是 ISS 前景 + 地球边缘). Storybook Atmosphere-LightingMask 把 ISS 放在经度 -110, 纬度 45, 高度 408 km, 地方时约 17:00, 用于拍晨昏线.

ISS 模型路径在public文件夹，目录保留原始压缩文件 iss.glb. Cesium 1.140 对HR_mesh_quantization + EXT_meshopt_compression 的包围盒/顶点尺度会出错, 因此另存解量化后的 iss-cesium.glb(约 112 m × 69 m × 59 m, JPEG 贴图)供页面加载.

- 另一个参考：https://mp.weixin.qq.com/s/uBnkULbgCBQcbW0a7400lw

- 可使用打包方式生成,最好后续可生成Npm包供大家使用(后续任务，本次不做)
- Cesium 已有同物理问题的开源实现, 应先用它把视角, 太阳, ISS, 高清分辨率跑通. 考虑用自定义 PostProcessStage 或大气椭球 shader 吸收 Bruneton 的 LUT

## 任务
- 先调研开源方案,再写具体实施方案，待确认后再实施
- 要实现类似takram-design-engineering中的大气散射+近景ISS模型光照阴影层次分明的照片级效果
- 效果图可参考takram-design-engineering或public文件夹中png