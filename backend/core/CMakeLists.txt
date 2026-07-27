cmake_minimum_required(VERSION 3.16)
project(url_shortener_core VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# Find Node.js headers
find_program(NODE_EXECUTABLE node)
if(NODE_EXECUTABLE)
    execute_process(COMMAND ${NODE_EXECUTABLE} -e "
        const p = require('path');
        console.log(p.dirname(process.execPath) + '/../include/node');
        "
        OUTPUT_VARIABLE NODE_HEADERS_DIR
        OUTPUT_STRIP_TRAILING_WHITESPACE)
endif()

# Find node-addon-api headers
set(NAPI_INCLUDE_DIR "${CMAKE_SOURCE_DIR}/../node_modules/node-addon-api")
if(NOT EXISTS "${NAPI_INCLUDE_DIR}/napi.h")
    # Fallback: try to find via node
    execute_process(COMMAND ${NODE_EXECUTABLE} -e "console.log(require('node-addon-api').include)"
        OUTPUT_VARIABLE NAPI_INCLUDE_DIR_TMP
        OUTPUT_STRIP_TRAILING_WHITESPACE
        ERROR_QUIET)
    if(NAPI_INCLUDE_DIR_TMP)
        set(NAPI_INCLUDE_DIR "${NAPI_INCLUDE_DIR_TMP}")
    endif()
endif()

message(STATUS "Node headers: ${NODE_HEADERS_DIR}")
message(STATUS "N-API include: ${NAPI_INCLUDE_DIR}")

file(GLOB SOURCES "src/*.cpp")

# Native addon shared library
add_library(url_shortener_core SHARED ${SOURCES} bindings/node_module.cpp)
target_include_directories(url_shortener_core PRIVATE
    include
    ${NODE_HEADERS_DIR}
    ${NAPI_INCLUDE_DIR}
)

set_target_properties(url_shortener_core PROPERTIES
    SUFFIX ".node"
    PREFIX ""
)

install(TARGETS url_shortener_core
    LIBRARY DESTINATION lib
    RUNTIME DESTINATION bin
)
