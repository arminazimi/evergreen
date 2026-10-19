cmake_minimum_required(VERSION 3.31)

project(zero C CXX)

set(CMAKE_C_STANDARD 17)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(CMAKE_CXX_COMPILER_ID STREQUAL "GNU" AND CMAKE_CXX_COMPILER_VERSION VERSION_LESS 13.2)
  message(FATAL_ERROR "GCC 13.2 or newer is required")
endif()

add_executable(app src/main.cpp)
