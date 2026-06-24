# Zenodo Downloader

一个用于从 [Zenodo](https://zenodo.org) 研究数据仓库下载文件的工具，支持命令行和 Web 界面两种使用方式。

[![CI](https://github.com/AT-Dog-2/zenodo_get_web/actions/workflows/ci.yml/badge.svg)](https://github.com/AT-Dog-2/zenodo_get_web/actions/workflows/ci.yml)

## 功能特点

- 支持通过记录 ID 或 DOI 下载文件
- 支持文件类型过滤（glob 模式）
- 支持 MD5 校验
- 支持断点续传
- 提供 Web 图形界面（中文）
- 提供 Python API

## 安装

### 方式一：直接运行（无需安装）

```bash
uvx zenodo_get RECORD_ID_OR_DOI
```

### 方式二：使用 pip 安装

```bash
pip install zenodo-get
```

## 使用方法

### 命令行界面

```bash
# 下载所有文件
uvx zenodo_get 1234567

# 使用 DOI 下载
uvx zenodo_get -d 10.5281/zenodo.1234567

# 仅下载 PDF 文件到指定目录
uvx zenodo_get 1234567 -g "*.pdf" -o ./downloads

# 生成 MD5 校验文件
uvx zenodo_get 1234567 -m

# 将 URL 列表写入文件
uvx zenodo_get 1234567 -w urls.txt
```

### Web 界面

启动 Web 服务：

```bash
python -m zenodo_get.web
```

然后在浏览器中打开 http://127.0.0.1:5001

Web 界面支持：
- 输入 DOI 或记录 ID 验证
- 查看文件列表和元数据
- 选择要下载的文件
- 实时显示下载进度
- 中英文切换

### 常用选项

| 选项 | 说明 |
|------|------|
| `-o DIR` | 输出目录 |
| `-g PATTERN` | 文件过滤模式（如 `*.pdf`） |
| `-m` | 生成 md5sums.txt 校验文件 |
| `-w FILE` | 将 URL 写入文件 |
| `-e` | 遇到错误继续下载 |
| `-n` | 重新开始下载（不续传） |
| `-v N` | 详细程度（0-4） |

## Python API

```python
from zenodo_get import download

# 下载所有文件
download("10.5281/zenodo.1234567", output_dir="./data")

# 仅下载 CSV 文件
download(
    record_or_doi="1234567",
    output_dir="./data",
    file_glob="*.csv",
)
```

## 环境要求

- Python 3.10+

## 许可证

参见 [LICENSE.txt](LICENSE.txt)
