# cmake_minimum_required(VERSION 2.8)
# set(CMAKE_CXX_STANDARD 98)

set(PROJECT_DESCRIPTION "Mentions cmake_minimum_required(VERSION 3.16) in a string")
set(CMAKE_BUILD_TYPE Debug)
set(REQUIRED_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD ${REQUIRED_CXX_STANDARD})

cmake_minimum_required(VERSION ${MINIMUM_CMAKE_VERSION})

if(CMAKE_CXX_COMPILER_ID STREQUAL "MSVC")
  message(STATUS "Compiler check without a version to compare")
endif()

add_executable(app src/main.cpp)
