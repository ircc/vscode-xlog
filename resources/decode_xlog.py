#!/usr/bin/python
# -*- coding: utf-8 -*-

import sys
import os
import zipfile
import traceback
import tempfile
import shutil
import struct
import binascii
import zlib

# Python 2和3兼容性处理
if sys.version_info[0] < 3:
    reload(sys)
    sys.setdefaultencoding('utf-8')
    try:
        from __builtin__ import unicode
    except ImportError:
        # 如果无法导入，创建一个基本实现
        unicode = str

# 增加递归限制以避免堆栈溢出
sys.setrecursionlimit(3000)  # 默认为1000

try:
    import __builtin__  # Python 2
except ImportError:
    __builtin__ = None  # Python 3

# Mars Xlog 魔数常量定义
MAGIC_NO_COMPRESS_START = 0x03
MAGIC_NO_COMPRESS_START1 = 0x06
MAGIC_NO_COMPRESS_NO_CRYPT_START = 0x08
MAGIC_COMPRESS_START = 0x04
MAGIC_COMPRESS_START1 = 0x05
MAGIC_COMPRESS_START2 = 0x07
MAGIC_COMPRESS_NO_CRYPT_START = 0x09
MAGIC_SYNC_ZSTD_START = 0x0A
MAGIC_SYNC_NO_CRYPT_ZSTD_START = 0x0B
MAGIC_ASYNC_ZSTD_START = 0x0C
MAGIC_ASYNC_NO_CRYPT_ZSTD_START = 0x0D
MAGIC_END = 0x00

# 全局序列号
lastseq = 0

def print_utf8(text):
    """以UTF-8编码打印文本，避免编码问题"""
    try:
        if sys.version_info[0] >= 3:
            print(text)
        else:
            # Python 2 兼容处理
            if isinstance(text, unicode):
                print(text.encode('utf-8'))
            else:
                print(text)
    except UnicodeEncodeError:
        # 遇到编码错误时，尝试用ASCII编码输出，替换不可打印字符
        try:
            if sys.version_info[0] >= 3:
                print(text.encode('ascii', 'replace').decode('ascii'))
            else:
                print(text.encode('ascii', 'replace'))
        except:
            # 如果还是失败，使用英文替代消息
            print("Message contains characters that cannot be displayed")

def is_zip_file(file_path):
    """检查文件是否为ZIP格式"""
    try:
        with open(file_path, 'rb') as f:
            return f.read(4) == b'PK\x03\x04'
    except:
        return False

def is_mars_xlog_v2(file_path):
    """检查文件是否为Mars Xlog V2格式"""
    try:
        with open(file_path, 'rb') as f:
            magic = ord(f.read(1))
            return magic in [MAGIC_NO_COMPRESS_START, MAGIC_NO_COMPRESS_START1,
                          MAGIC_COMPRESS_START, MAGIC_COMPRESS_START1,
                          MAGIC_COMPRESS_START2, MAGIC_NO_COMPRESS_NO_CRYPT_START,
                          MAGIC_COMPRESS_NO_CRYPT_START]
    except:
        return False

def is_mars_xlog_v3(file_path):
    """检查文件是否为Mars Xlog V3格式（ZSTD压缩）"""
    try:
        with open(file_path, 'rb') as f:
            magic = ord(f.read(1))
            return magic in [MAGIC_SYNC_ZSTD_START, MAGIC_SYNC_NO_CRYPT_ZSTD_START,
                          MAGIC_ASYNC_ZSTD_START, MAGIC_ASYNC_NO_CRYPT_ZSTD_START]
    except:
        return False

def buffer(data, offset, length):
    """兼容Python 2和3的buffer处理"""
    if sys.version_info[0] >= 3:
        if isinstance(data, bytearray):
            return data[offset:offset+length]
        return memoryview(data)[offset:offset+length]
    else:
        # 修复递归调用问题
        # 原代码: return buffer(data, offset, length) 会导致无限递归
        # 在Python 2中使用旧的buffer函数
        return __builtin__.buffer(data, offset, length)

def is_good_log_buffer(_buffer, _offset, count):
    """验证日志数据块是否有效"""
    current_offset = _offset
    remaining_count = count

    while True:
        if current_offset == len(_buffer):
            return (True, '')

        magic_start = _buffer[current_offset]
        if MAGIC_NO_COMPRESS_START == magic_start or MAGIC_COMPRESS_START == magic_start or MAGIC_COMPRESS_START1 == magic_start:
            crypt_key_len = 4
        elif (MAGIC_COMPRESS_START2 == magic_start or MAGIC_NO_COMPRESS_START1 == magic_start or
            MAGIC_NO_COMPRESS_NO_CRYPT_START == magic_start or MAGIC_COMPRESS_NO_CRYPT_START == magic_start or
            MAGIC_SYNC_ZSTD_START == magic_start or MAGIC_SYNC_NO_CRYPT_ZSTD_START == magic_start or
            MAGIC_ASYNC_ZSTD_START == magic_start or MAGIC_ASYNC_NO_CRYPT_ZSTD_START == magic_start):
            crypt_key_len = 64
        else:
            return (False, '_buffer[%d]:%d != MAGIC_NUM_START' % (current_offset, _buffer[current_offset]))

        header_len = 1 + 2 + 1 + 1 + 4 + crypt_key_len

        if current_offset + header_len + 1 + 1 > len(_buffer):
            return (False, 'offset:%d > len(buffer):%d' % (current_offset, len(_buffer)))

        if sys.version_info[0] >= 3:
            length = struct.unpack("I", _buffer[current_offset+header_len-4-crypt_key_len:current_offset+header_len-crypt_key_len])[0]
        else:
            length = struct.unpack_from("I", buffer(_buffer, current_offset+header_len-4-crypt_key_len, 4))[0]

        if current_offset + header_len + length + 1 > len(_buffer):
            return (False, 'log length:%d, end pos %d > len(buffer):%d' %
                    (length, current_offset + header_len + length + 1, len(_buffer)))

        if MAGIC_END != _buffer[current_offset + header_len + length]:
            return (False, 'log length:%d, buffer[%d]:%d != MAGIC_END' %
                    (length, current_offset + header_len + length, _buffer[current_offset + header_len + length]))

        # 递减计数器并更新当前偏移量
        remaining_count -= 1
        if remaining_count <= 0:
            return (True, '')

        current_offset = current_offset + header_len + length + 1

def get_log_start_pos(_buffer, _count):
    """获取日志起始位置"""
    offset = 0
    while True:
        if offset >= len(_buffer):
            break

        # 检查所有可能的魔数
        magic_values = [MAGIC_NO_COMPRESS_START, MAGIC_NO_COMPRESS_START1, MAGIC_COMPRESS_START,
                      MAGIC_COMPRESS_START1, MAGIC_COMPRESS_START2, MAGIC_NO_COMPRESS_NO_CRYPT_START,
                      MAGIC_COMPRESS_NO_CRYPT_START, MAGIC_SYNC_ZSTD_START,
                      MAGIC_SYNC_NO_CRYPT_ZSTD_START, MAGIC_ASYNC_ZSTD_START,
                      MAGIC_ASYNC_NO_CRYPT_ZSTD_START]

        # 如果找到任何魔数，尝试解析
        if _buffer[offset] in magic_values:
            # 尝试解析，即使失败也继续搜索
            try:
                if is_good_log_buffer(_buffer, offset, _count)[0]:
                    return offset
            except:
                pass
        offset += 1

    # 如果没有找到有效的起始位置，尝试从文件开头开始解析
    return 0

def decode_buffer(_buffer, _offset, _outbuffer):
    """解码单个日志缓冲区"""
    global lastseq

    if _offset >= len(_buffer):
        return -1

    ret = is_good_log_buffer(_buffer, _offset, 1)
    if not ret[0]:
        fixpos = get_log_start_pos(_buffer[_offset:], 1)
        if -1 == fixpos:
            return -1
        else:
            _outbuffer.extend(("[F]decode_log_file.py decode error len=%d, result:%s \n" %
                            (fixpos, ret[1])).encode('utf-8'))
            _offset += fixpos

    magic_start = _buffer[_offset]
    if MAGIC_NO_COMPRESS_START == magic_start or MAGIC_COMPRESS_START == magic_start or MAGIC_COMPRESS_START1 == magic_start:
        crypt_key_len = 4
    elif (MAGIC_COMPRESS_START2 == magic_start or MAGIC_NO_COMPRESS_START1 == magic_start or
          MAGIC_NO_COMPRESS_NO_CRYPT_START == magic_start or MAGIC_COMPRESS_NO_CRYPT_START == magic_start or
          MAGIC_SYNC_ZSTD_START == magic_start or MAGIC_SYNC_NO_CRYPT_ZSTD_START == magic_start or
          MAGIC_ASYNC_ZSTD_START == magic_start or MAGIC_ASYNC_NO_CRYPT_ZSTD_START == magic_start):
        crypt_key_len = 64
    else:
        _outbuffer.extend(('in DecodeBuffer _buffer[%d]:%d != MAGIC_NUM_START' %
                         (_offset, magic_start)).encode('utf-8'))
        return -1

    header_len = 1 + 2 + 1 + 1 + 4 + crypt_key_len

    if sys.version_info[0] >= 3:
        length = struct.unpack("I", _buffer[_offset+header_len-4-crypt_key_len:_offset+header_len-crypt_key_len])[0]
        seq = struct.unpack("H", _buffer[_offset+header_len-4-crypt_key_len-2-2:_offset+header_len-4-crypt_key_len-2])[0]
        begin_hour = _buffer[_offset+header_len-4-crypt_key_len-1-1]
        end_hour = _buffer[_offset+header_len-4-crypt_key_len-1]
    else:
        length = struct.unpack_from("I", buffer(_buffer, _offset+header_len-4-crypt_key_len, 4))[0]
        seq = struct.unpack_from("H", buffer(_buffer, _offset+header_len-4-crypt_key_len-2-2, 2))[0]
        begin_hour = struct.unpack_from("c", buffer(_buffer, _offset+header_len-4-crypt_key_len-1-1, 1))[0]
        end_hour = struct.unpack_from("c", buffer(_buffer, _offset+header_len-4-crypt_key_len-1, 1))[0]
        if isinstance(begin_hour, str):
            begin_hour = ord(begin_hour)
        if isinstance(end_hour, str):
            end_hour = ord(end_hour)

    tmpbuffer = bytearray(length)
    tmpbuffer[:] = _buffer[_offset+header_len:_offset+header_len+length]

    if seq != 0 and seq != 1 and lastseq != 0 and seq != (lastseq+1):
        _outbuffer.extend(("[F]decode_log_file.py log seq:%d-%d is missing\n" %
                         (lastseq+1, seq-1)).encode('utf-8'))

    if seq != 0:
        lastseq = seq

    try:
        if (MAGIC_NO_COMPRESS_START1 == magic_start or MAGIC_COMPRESS_START2 == magic_start or
            MAGIC_SYNC_ZSTD_START == magic_start or MAGIC_ASYNC_ZSTD_START == magic_start):
            print_utf8("Warning: ZSTD compression detected but not supported, please install zstandard library")
            # 这些格式需要zstandard库，如果需要可以安装: pip install zstandard
        elif MAGIC_ASYNC_NO_CRYPT_ZSTD_START == magic_start:
            print_utf8("Warning: ZSTD compression detected but not supported, please install zstandard library")
            # 同上，需要zstd库
        elif MAGIC_COMPRESS_START == magic_start or MAGIC_COMPRESS_NO_CRYPT_START == magic_start:
            decompressor = zlib.decompressobj(-zlib.MAX_WBITS)
            if sys.version_info[0] >= 3:
                tmpbuffer = decompressor.decompress(tmpbuffer)
            else:
                tmpbuffer = decompressor.decompress(str(tmpbuffer))
        elif MAGIC_COMPRESS_START1 == magic_start:
            decompress_data = bytearray()
            while len(tmpbuffer) > 0:
                if sys.version_info[0] >= 3:
                    single_log_len = struct.unpack("H", tmpbuffer[0:2])[0]
                else:
                    single_log_len = struct.unpack_from("H", buffer(tmpbuffer, 0, 2))[0]
                decompress_data.extend(tmpbuffer[2:single_log_len+2])
                tmpbuffer[:] = tmpbuffer[single_log_len+2:len(tmpbuffer)]

            decompressor = zlib.decompressobj(-zlib.MAX_WBITS)
            if sys.version_info[0] >= 3:
                tmpbuffer = decompressor.decompress(decompress_data)
            else:
                tmpbuffer = decompressor.decompress(str(decompress_data))
        else:
            pass

    except Exception as e:
        traceback.print_exc()
        _outbuffer.extend(("[F]decode_log_file.py decompress err, " + str(e) + "\n").encode('utf-8'))
        return _offset+header_len+length+1

    _outbuffer.extend(tmpbuffer)

    return _offset+header_len+length+1

def parse_mars_xlog_file(file_path, output_file):
    """解析Mars Xlog文件"""
    global lastseq
    lastseq = 0

    with open(file_path, "rb") as fp:
        _buffer = bytearray(os.path.getsize(file_path))
        fp.readinto(_buffer)

    # 尝试从不同位置开始解析
    start_positions = [0]
    for i in range(len(_buffer)):
        if i > 0 and _buffer[i] in [MAGIC_NO_COMPRESS_START, MAGIC_NO_COMPRESS_START1,
                                  MAGIC_COMPRESS_START, MAGIC_COMPRESS_START1,
                                  MAGIC_COMPRESS_START2, MAGIC_NO_COMPRESS_NO_CRYPT_START,
                                  MAGIC_COMPRESS_NO_CRYPT_START, MAGIC_SYNC_ZSTD_START,
                                  MAGIC_SYNC_NO_CRYPT_ZSTD_START, MAGIC_ASYNC_ZSTD_START,
                                  MAGIC_ASYNC_NO_CRYPT_ZSTD_START]:
            start_positions.append(i)

    outbuffer = bytearray()
    success = False

    # 尝试从每个可能的起始位置解析
    for startpos in start_positions:
        try:
            current_pos = startpos
            temp_buffer = bytearray()

            while True:
                current_pos = decode_buffer(_buffer, current_pos, temp_buffer)
                if current_pos == -1:
                    break

            if len(temp_buffer) > 0:
                outbuffer = temp_buffer
                success = True
                break
        except:
            continue

    if not success:
        print_utf8("No valid log data found in file")
        return None

    if 0 == len(outbuffer):
        print_utf8("No valid log content decoded")
        return None

    with open(output_file, "wb") as fpout:
        fpout.write(outbuffer)

    print_utf8("Successfully decoded: " + output_file)
    return output_file

def decode_zipfile(file_path, output_file):
    """解码标准ZIP格式的xlog文件"""
    try:
        # 在临时目录中解压文件，避免权限问题
        temp_dir = tempfile.mkdtemp(prefix="xlog_temp_")

        try:
            with zipfile.ZipFile(file_path, 'r') as zip_ref:
                # 提取所有文件到临时目录
                zip_ref.extractall(temp_dir)

                print_utf8("Extracted files to temporary directory: " + temp_dir)

                # 合并所有文本文件内容到一个输出文件
                with open(output_file, 'wb') as outfile:
                    for extracted_file in os.listdir(temp_dir):
                        extract_path = os.path.join(temp_dir, extracted_file)
                        if os.path.isfile(extract_path):
                            try:
                                with open(extract_path, 'rb') as infile:
                                    outfile.write(infile.read())
                                    outfile.write(b"\n")  # 添加换行符分隔不同文件的内容
                            except Exception as e:
                                print_utf8("Warning: Error processing file: " + extracted_file + ", " + str(e))
        finally:
            # 清理临时目录
            shutil.rmtree(temp_dir, ignore_errors=True)
            print_utf8("Cleaned temporary directory")

        print_utf8("Successfully decoded: " + output_file)
        return output_file
    except Exception as e:
        print_utf8("Error details: " + traceback.format_exc())
        raise Exception("Extraction failed: " + str(e))

def decode_xlog(file_path):
    """根据文件格式解码xlog文件"""
    if not os.path.exists(file_path):
        raise Exception("File not exists: " + file_path)

    try:
        base_name = os.path.basename(file_path)
        file_name_without_ext = os.path.splitext(base_name)[0]
        output_file = os.path.join(os.path.dirname(file_path), file_name_without_ext + "_.log")

        # 检查文件是否为Mars Xlog格式
        if is_mars_xlog_v2(file_path) or is_mars_xlog_v3(file_path):
            print_utf8("Detected Mars Xlog format")
            return parse_mars_xlog_file(file_path, output_file)

        # 检查文件是否为ZIP格式
        elif is_zip_file(file_path):
            print_utf8("Detected ZIP format")
            return decode_zipfile(file_path, output_file)

        # 尝试作为Mars Xlog格式解析
        else:
            print_utf8("Unknown format, trying Mars Xlog decoding")
            try:
                return parse_mars_xlog_file(file_path, output_file)
            except Exception as e:
                print_utf8("Mars Xlog decoding failed: " + str(e))
                # 最后尝试ZIP格式
                try:
                    print_utf8("Trying ZIP format")
                    return decode_zipfile(file_path, output_file)
                except Exception as e:
                    raise Exception("Unable to decode file: " + str(e))
    except Exception as e:
        print_utf8("Error details: " + traceback.format_exc())
        raise Exception("Decoding failed: " + str(e))

def process_directory(directory_path):
    """处理目录下所有的xlog文件"""
    if not os.path.exists(directory_path):
        raise Exception("Directory not exists: " + directory_path)

    processed_files = []
    for root, _, files in os.walk(directory_path):
        for file in files:
            # 获取文件扩展名并转换为小写进行比较
            ext = os.path.splitext(file)[1].lower()
            if ext in ['.xlog', '.mmap3']:
                file_path = os.path.join(root, file)
                try:
                    print_utf8("Processing file: " + file_path)
                    output_file = decode_xlog(file_path)
                    if output_file:
                        processed_files.append(output_file)
                except Exception as e:
                    print_utf8("Error processing file " + file_path + ": " + str(e))
    return processed_files

def main():
    """主函数"""
    try:
        # 打印版本信息
        print_utf8("Xlog decoder - Python version: " + str(sys.version_info[0]) + "." + str(sys.version_info[1]))

        if len(sys.argv) < 2:
            print_utf8("Please provide xlog file path or directory path")
            return 1

        file_path = sys.argv[1]
        if os.path.isfile(file_path):
            output_file = decode_xlog(file_path)
            if output_file:
                print_utf8("Successfully decoded to: " + output_file)
                return 0
            else:
                print_utf8("Failed to decode file")
                return 1
        elif os.path.isdir(file_path):
            processed_files = process_directory(file_path)
            if processed_files:
                for file in processed_files:
                    print_utf8("- " + file)
                print_utf8("Successfully processed %d files" % len(processed_files))
                return 0
            else:
                print_utf8("No files were processed")
                return 1
        else:
            print_utf8("Path not exists: " + file_path)
            return 1
    except Exception as e:
        print_utf8("Error: " + str(e))
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(main())