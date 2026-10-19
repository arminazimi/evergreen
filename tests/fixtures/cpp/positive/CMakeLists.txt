cmake_minimum_required(VERSION 3.16)

project(positive C CXX)

set(CMAKE_C_STANDARD 99)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(CMAKE_C_COMPILER_ID STREQUAL "GNU" AND CMAKE_C_COMPILER_VERSION VERSION_LESS 9.3)
  message(FATAL_ERROR "GCC 9.3 or newer is required for C")
endif()

if(CMAKE_CXX_COMPILER_ID STREQUAL "GNU" AND CMAKE_CXX_COMPILER_VERSION VERSION_LESS 9.3)
  message(FATAL_ERROR "GCC 9.3 or newer is required for C++")
endif()

add_executable(app src/main.cpp)
