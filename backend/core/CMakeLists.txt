cmake_minimum_required(VERSION 3.16)
project(url_shortener_core VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# Find Node.js and N-API
find_program(NODE_EXECUTABLE node)
if(NODE_EXECUTABLE)
    execute_process(COMMAND ${NODE_EXECUTABLE} -e "console.log(require('node-addon-api').include)"
        OUTPUT_VARIABLE NAPI_INCLUDE_DIR
        OUTPUT_STRIP_TRAILING_WHITESPACE
        ERROR_QUIET)
    execute_process(COMMAND ${NODE_EXECUTABLE} -e "console.log(process.versions.node)"
        OUTPUT_VARIABLE NODE_VERSION
        OUTPUT_STRIP_TRAILING_WHITESPACE)
    execute_process(COMMAND ${NODE_EXECUTABLE} -e "
        const p = require('path');
        console.log(p.dirname(process.execPath) + '/../include/node');
        "
        OUTPUT_VARIABLE NODE_HEADERS_DIR
        OUTPUT_STRIP_TRAILING_WHITESPACE)
endif()

file(GLOB SOURCES "src/*.cpp")

# Native addon shared library
add_library(url_shortener_core SHARED ${SOURCES} bindings/node_module.cpp)
target_include_directories(url_shortener_core PRIVATE
    include
    ${NODE_HEADERS_DIR}
    ${NAPI_INCLUDE_DIR}
)

if(WIN32)
    set_target_properties(url_shortener_core PROPERTIES
        SUFFIX ".node"
        PREFIX ""
    )
else()
    set_target_properties(url_shortener_core PROPERTIES
        SUFFIX ".node"
        PREFIX ""
    )
endif()

install(TARGETS url_shortener_core
    LIBRARY DESTINATION lib
    RUNTIME DESTINATION bin
)
