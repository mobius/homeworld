# RGL (Relic Graphics Library) 图形引擎文档

## 概述

RGL 是 Homeworld 的自定义 3D 图形引擎，采用 OpenGL 风格的 API 设计，支持多种渲染后端。这个引擎代表了 1990 年代末期 3D 游戏引擎的技术水平。

## 架构设计

### 核心层次结构

```
┌─────────────────────────────────────────┐
│         游戏层 (Game Layer)             │
│     glBegin/glVertex/glEnd 调用         │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│       kGL (Kernel Graphics Library)     │
│     - 状态管理                          │
│     - 矩阵变换                          │
│     - 光照计算                          │
│     - 裁剪处理                          │
└────────────────┬────────────────────────┘
                 │
        ┌────────┴────────┐
        │                 │
┌───────▼──────┐  ┌──────▼─────────┐
│  驱动抽象层  │  │  软件渲染器    │
│ (Driver API) │  │ (Software)     │
└───────┬──────┘  └─────────────────┘
        │
    ┌───┴────┬──────────┬─────────┐
    │        │          │         │
┌───▼──┐ ┌──▼───┐  ┌───▼──┐  ┌──▼───┐
│Direct│ │Glide │  │OpenGL│  │Other │
│3D    │ │3dfx  │  │      │  │      │
└──────┘ └──────┘  └──────┘  └──────┘
```

### 核心组件

#### 1. kGL (Kernel Graphics Library)

**文件**: `src/rgl/kgl.c`, `src/rgl/kgl.h`

kGL 是引擎的核心，提供了 OpenGL 风格的 API 和状态管理：

**核心数据结构**:
```c
typedef struct gl_context_s {
    // 帧缓冲区
    gl_framebuffer Buffer;
    vertex_buffer* VB;

    // 矩阵栈
    GLfloat ModelViewMatrix[16];
    GLfloat ProjectionMatrix[16];
    GLfloat ModelViewStack[MAX_MODELVIEW_STACK_DEPTH][16];

    // 状态标志
    GLboolean Lighting;
    GLboolean DepthTest;
    GLboolean Blend;
    GLboolean Fog;

    // 光照系统
    gl_light Light[MAX_LIGHTS];
    gl_material Material[2];  // 前面和后面材质

    // 纹理系统
    gl_texture_object* TexBoundObject;
    GLboolean TexEnabled;

    // 驱动函数表
    gl_driver_funcs DriverFuncs;
    void* DriverCtx;
} gl_context;
```

**矩阵类型分类** (性能优化):
```c
#define MATRIX_IDENTITY     1  // 单位矩阵（最快路径）
#define MATRIX_2D_NO_ROT    2  // 2D 无旋转
#define MATRIX_2D           3  // 2D 变换
#define MATRIX_3D           4  // 3D 变换
#define MATRIX_GENERAL      5  // 通用矩阵（最慢）
#define MATRIX_ORTHO        6  // 正交投影
#define MATRIX_PERSPECTIVE  7  // 透视投影
```

#### 2. 驱动抽象层

**文件**: `src/rgl/kgl.h` (gl_driver_funcs 结构)

驱动函数表定义了所有渲染后端必须实现的接口：

```c
typedef struct gl_driver_funcs_s {
    // 初始化
    GLboolean (*init_driver)();
    GLboolean (*post_init_driver)();
    void (*shutdown_driver)();

    // 窗口管理
    GLboolean (*create_window)();
    void (*delete_window)();

    // 缓冲区管理
    void (*lock_buffer)();
    void (*unlock_buffer)();
    GLubyte* (*get_framebuffer)();

    // 清除操作
    void (*clear_colorbuffer)();
    void (*clear_depthbuffer)();

    // 图元绘制
    void (*draw_triangle)();
    void (*draw_quad)();
    void (*draw_line)();
    void (*draw_point)();

    // 纹理操作
    void (*bind_texture)();
    void (*tex_param)();
    void (*tex_img)();

    // 批处理
    void (*flush_batch)();
} gl_driver_funcs;
```

#### 3. Direct3D 驱动

**文件**: `src/rgl/d3driver.cpp`

Direct3D 6 渲染驱动实现：

**核心特性**:
- 顶点缓冲区管理 (VB_SIZE = 4096)
- 多种顶点格式支持
  - `xyz_c` - 位置 + 颜色
  - `xyz_t` - 位置 + 纹理坐标
  - `xyz_c_t` - 位置 + 颜色 + 纹理坐标
- 批处理优化
- 纹理管理

**顶点格式定义**:
```cpp
typedef struct xyz_c {
    float x, y, z;
    DWORD c;
} xyz_c;

typedef struct xyz_c_t {
    float x, y, z;
    DWORD c;
    float s, t;
} xyz_c_t;
```

**渲染标志**:
```cpp
#define VERTEX_FLAGS (D3DDP_DONOTCLIP | D3DDP_DONOTLIGHT | D3DDP_DONOTUPDATEEXTENTS)
```

#### 4. 软件渲染器

**文件**: `src/rgl/swdriver.c`, `src/rgl/draw.cpp`

纯软件实现的渲染器，用于无硬件加速的机器：

**核心组件**:
- **扫描线渲染** (`scan.c`): 光栅化三角形
- **像素处理** (`span.c`): 像素级操作
- **裁剪** (`clip.c`): 视锥体裁剪
- **透视正确纹理映射** (`newpersptri.c`)

**优化的三角形光栅化**:
```c
// 多种三角形渲染路径
void newRGBAPerspTriangle(...)    // RGBA + 透视纹理
void newRGBATexTriangle(...)      // RGBA 纹理映射
void newBlendTexTriangle(...)     // 混合纹理
void newTriangle(...)             // 基础三角形
```

#### 5. Glide 驱动

**文件**: `src/rgl/fxdriver.c`

针对 3dfx Voodoo 显卡的优化驱动。

---

## 渲染管线

### 1. 顶点处理流程

```
 glVertex3f()
       │
       ▼
 ┌─────────────┐
 │ 顶点变换    │  ModelView 矩阵变换
 │ Transform   │
 └──────┬──────┘
        │
        ▼
 ┌─────────────┐
 │ 光照计算    │  计算每个顶点的颜色
 │ Lighting    │
 └──────┬──────┘
        │
        ▼
 ┌─────────────┐
 │ 投影变换    │  Projection 矩阵变换
 │ Projection  │
 └──────┬──────┘
        │
        ▼
 ┌─────────────┐
 │ 裁剪        │  视锥体裁剪
 │ Clipping    │
 └──────┬──────┘
        │
        ▼
 ┌─────────────┐
 │ 透视除法    │  w 坐标归一化
 │ Perspective │
 └──────┬──────┘
        │
        ▼
 ┌─────────────┐
 │ 视口变换    │  映射到屏幕坐标
 │ Viewport    │
 └──────┬──────┘
        │
        ▼
    光栅化
```

### 2. 光栅化流程

```
     三角形设置
          │
          ▼
   ┌──────────────┐
   │ 边缘函数计算  │
   │ Edge Setup   │
   └──────┬───────┘
          │
          ▼
   ┌──────────────┐
   │ 扫描线遍历    │
   │ Scanline     │
   └──────┬───────┘
          │
          ▼
   ┌──────────────┐
   │ 像素着色     │
   │  - 深度测试  │
   │  - 纹理采样  │
   │  - 雾化      │
   │  - Alpha测试 │
   └──────┬───────┘
          │
          ▼
      写入帧缓冲
```

### 3. 纹理映射

**透视正确纹理映射** (`src/rgl/newpersptri.c`):

```c
// 透视正确的纹理坐标插值
void newRGBAPerspTriangle(
    vertex* v0, vertex* v1, vertex* v2
)
{
    // 1/w, u/w, v/w 线性插值
    // 每个像素: u = (u/w) / (1/w)

    for (y = y_min; y <= y_max; y++) {
        for (x = x_min; x <= x_max; x++) {
            w_inv = interpolate(1/w);
            u = interpolate(u/w) / w_inv;
            v = interpolate(v/w) / w_inv;
            color = tex2D(u, v);
            set_pixel(x, y, color);
        }
    }
}
```

---

## 关键技术特性

### 1. 深度缓冲

**文件**: `src/rgl/kgl.h`

```c
#define DEPTH_BITS 32

typedef unsigned int GLdepth;  // 32位深度缓冲

#define MAX_DEPTH 0x00ffffff
#define DEPTH_SCALE ((GLfloat)0x00ffffff)
```

**深度测试**:
```c
// Z缓冲地址宏
#define Z_ADDRESS(CTX, X, Y) \
    (CTX->DepthBuffer + zMult[Y] + (X))
```

### 2. 光照系统

**支持的光照特性**:
- 最多 3 个光源 (`MAX_LIGHTS = 3`)
- Gouraud 着色 (GL_SMOOTH)
- 平面着色 (GL_FLAT)
- 双面光照

**光源结构**:
```c
typedef struct gl_light_s {
    GLfloat Ambient[4];
    GLfloat Diffuse[4];
    GLfloat Specular[4];
    GLfloat Position[4];
    GLfloat ConstantAttenuation;
    GLfloat LinearAttenuation;
    GLfloat QuadraticAttenuation;
    GLboolean Enabled;
} gl_light;
```

### 3. 纹理系统

**纹理对象**:
```c
typedef struct gl_texture_object_s {
    GLuint Name;
    GLenum WrapS, WrapT;      // GL_CLAMP 或 GL_REPEAT
    GLenum Min, Mag;          // 缩小/放大过滤器
    GLuint Width, Height;
    GLuint WidthLog2, HeightLog2;
    GLubyte *Data;            // 纹理数据
    GLubyte *Palette;         // 调色板
    void *DriverData;         // 驱动特定数据
} gl_texture_object;
```

**纹理哈希表**: 使用哈希表管理纹理对象以快速查找。

### 4. 雾化系统

```c
typedef struct gl_context_s {
    GLint FogMode;            // GL_EXP, GL_EXP2, GL_LINEAR
    GLfloat FogDensity;
    GLfloat FogColor[4];
    // ...
} gl_context;
```

### 5. 裁剪系统

**用户裁剪平面**:
```c
#define MAX_CLIP_PLANES 6

GLboolean ClipEnabled[MAX_CLIP_PLANES];
GLfloat ClipEquation[MAX_CLIP_PLANES][4];
```

**视锥体裁剪**: 在 `src/rgl/clip.c` 中实现。

---

## 性能优化技术

### 1. 矩阵分类优化

不同类型的矩阵使用优化的变换路径：

```c
void gl_classify_modelview() {
    if (is_identity(matrix)) {
        ctx->ModelViewMatrixType = MATRIX_IDENTITY;
    } else if (is_2d_no_rotation(matrix)) {
        ctx->ModelViewMatrixType = MATRIX_2D_NO_ROT;
    } else if (is_2d(matrix)) {
        ctx->ModelViewMatrixType = MATRIX_2D;
    }
    // ...
}
```

### 2. 批处理

顶点累积到缓冲区后批量提交：

```c
#define VB_SIZE 4096

static GLint nVerts = 0;
static xyzw_c_t d3dVert[VB_SIZE];

void flush_batch() {
    if (nVerts > 0) {
        DrawPrimitive(D3DPT_TRIANGLELIST, ...);
        nVerts = 0;
    }
}
```

### 3. 快速路径

**单位矩阵快速路径**:
```c
if (ctx->ModelViewMatrixType == MATRIX_IDENTITY) {
    // 跳过矩阵乘法
    out->x = in->x;
    out->y = in->y;
    out->z = in->z;
} else {
    // 完整矩阵乘法
    transform(out, in, ctx->ModelViewMatrix);
}
```

### 4. CPU 特性检测

```c
typedef struct gl_context_s {
    GLuint CpuType;
    GLboolean CpuMMX;      // MMX 支持
    GLboolean CpuKatmai;   // SSE 支持 (Katmai 是 Pentium III 的代号)
} gl_context;
```

### 5. 固定点数学

**文件**: `src/rgl/fixed.h`

在某些情况下使用固定点运算以提高性能：

```c
typedef int GLfixed;

#define FIXED_SHIFT 16
#define FIXED_TO_FLOAT(x) ((float)(x) / (float)(1 << FIXED_SHIFT))
#define FLOAT_TO_FIXED(x) ((GLfixed)((x) * (float)(1 << FIXED_SHIFT)))
```

---

## 状态管理

### 1. 属性栈

```c
#define MAX_ATTRIB_STACK_DEPTH 16

typedef struct gl_attrib_s {
    GLenum type;
    union {
        GLfloat fvalue;
        GLint ivalue;
    } val;
} gl_attrib;

gl_attrib AttribStack[MAX_ATTRIB_STACK_DEPTH];
GLuint AttribStackDepth;
```

### 2. 矩阵栈

```c
#define MAX_MODELVIEW_STACK_DEPTH 16
#define MAX_PROJECTION_STACK_DEPTH 8

GLfloat ModelViewStack[MAX_MODELVIEW_STACK_DEPTH][16];
GLfloat ProjectionStack[MAX_PROJECTION_STACK_DEPTH][16];
```

### 3. 状态变化标志

```c
#define NEW_LIGHTING        0x1
#define NEW_MODELVIEW       0x2
#define NEW_PROJECTION      0x4
#define NEW_MODELVIEWINV    0x8
#define NEW_RASTER          0x10
#define NEW_ALL             0x1f

GLubyte NewMask;
```

---

## 帧缓冲区管理

### 帧缓冲结构

```c
typedef struct gl_framebuffer_s {
    GLuint Width, Height;
    GLuint Pitch;           // 每行字节数
    GLuint Depth;           // 每像素位数: 16, 24, 32
    GLuint ByteMult;        // Depth / 8
    gl_pixel_type PixelType;
} gl_framebuffer;
```

### 像素格式

```c
typedef enum {
    GL_RGB888,
    GL_BGR888,
    GL_RGB555,
    GL_RGB565,
    GL_RGB32,
    GL_BGR32,
    GL_RGBUNKNOWN
} gl_pixel_type;
```

---

## 扩展功能

### RGL 特定扩展

```c
#define RGL_SCREENSHOT      0x2000  // 截图
#define RGL_FULLSCREEN      0x1001  // 全屏
#define RGL_WINDOWED        0x1002  // 窗口
#define RGL_GAMMA_UP        0x6000  // 增加 gamma
#define RGL_GAMMA_DN        0x6001  // 减少 gamma
#define RGL_EFFECTPOINT     0x3000  // 特效点
#define RGL_SPECULAR_RENDER 0x4000  // 镜面反射渲染
```

### 函数扩展

```c
DLL GLuint glGetFrameCountEXT(void);
DLL GLboolean rglGetSkip(GLint y);
void glSuperClear();
```

---

## 内存管理

### 分配函数

```c
typedef void* (*MemAllocFunc)(GLint len, char* name, GLuint flags);
typedef GLint (*MemFreeFunc)(void* pointer);

void* (*AllocFunc)(GLint size);
void (*FreeFunc)(void* pointer);
```

### 纹理对象哈希表

```c
extern hashtable* _texobjs;

// 纹理对象管理
gl_texture_object* rglGetTexobj(GLuint name);
GLuint rglGetMaxTexobj(void);
```

---

## 工具函数

### 数学工具

**文件**: `src/rgl/maths.c`

矩阵和向量运算函数。

### 线条渲染

**文件**: `src/rgl/lines.c`

优化的线条绘制，包括：
- 实线
- 虚线 ( stipple )
- 抗锯齿线条

### 点渲染

**文件**: `src/rgl/span.c`

点精灵和点渲染。

---

## 初始化流程

```c
void main() {
    // 1. 创建渲染上下文
    GLcontext ctx;
    gl_init_context(&ctx, depthbuffer,
                    frontbuffer, backbuffer);

    // 2. 初始化显示模式
    rauxInitDisplayMode(AUX_RGB | AUX_DEPTH | AUX_DOUBLE);

    // 3. 创建窗口
    rauxInitPosition(0, 0, 640, 480, 16);
    glutCreateWindow("Homeworld");

    // 4. 驱动初始化
    ctx.DriverFuncs.init_driver();
    ctx.DriverFuncs.post_init_driver();

    // 5. 主循环
    glutMainLoop();
}
```

---

## 渲染器选择

### 设备枚举

```c
typedef struct device_s {
    GLboolean fastAlpha;
    GLboolean fastBlend;
    GLboolean litPalette;
    char* name;
    char* aliases;
} device_t;

GLint activeDevice;
GLint nDevices;
device_t* devices;
```

### 设备选择

```c
void rglSelectDevice(char* name, char* data);
```

可用设备：
- Direct3D 设备
- Glide 设备 (Voodoo)
- 软件渲染器
- OpenGL (通过 RGL 包装)

---

## 调试和分析

### 纹理日志

```c
#define RGL_TEXTURE_LOG 0x4610
```

### 性能计数器

```c
GLint LineCount;  // 渲染的线条数
```

### 帧计数

```c
DLL GLuint glGetFrameCountEXT(void);
```

---

## 文件列表

### 核心文件
| 文件 | 描述 |
|------|------|
| `kgl.c` | 核心图形库 |
| `kgl.h` | 公共 API 定义 |
| `kglu.c` | GLU 工具函数 |
| `kvb.h` | 顶点缓冲 |

### 渲染器
| 文件 | 描述 |
|------|------|
| `d3driver.cpp` | Direct3D 驱动 |
| `swdriver.c` | 软件渲染器 |
| `fxdriver.c` | Glide 驱动 |

### 光栅化
| 文件 | 描述 |
|------|------|
| `draw.cpp` | 渲染调度 |
| `scan.c` | 扫描线渲染 |
| `span.c` | 像素处理 |
| `clip.c` | 裁剪 |
| `newtriangle.c` | 三角形光栅化 |
| `newpersptri.c` | 透视纹理 |

### 工具
| 文件 | 描述 |
|------|------|
| `maths.c` | 数学运算 |
| `lines.c` | 线条渲染 |
| `hash.c` | 哈希表 |
| `rglext.c` | RGL 扩展 |

---

## 总结

RGL 是一个高度优化的 1990 年代末期 3D 引擎，具有以下特点：

1. **多后端支持**: Direct3D、Glide、软件渲染
2. **性能优化**: 矩阵分类、批处理、快速路径
3. **完整功能**: 光照、纹理、雾化、深度测试
4. **可扩展性**: 驱动抽象层支持新渲染器
5. **兼容性**: 软件回退确保在各种硬件上运行

这个引擎展示了在 OpenGL 硬件加速普及之前，游戏开发者如何实现高性能 3D 渲染。

---

*文档生成日期: 2026-01-08*
