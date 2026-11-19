cmake_minimum_required(VERSION 3.24)

# Every part of Matinee has the version in the root package.json. A
# packaged build passes it in, since it builds from a copy without it.
if(NOT MATINEE_VERSION)
  file(READ "${CMAKE_CURRENT_SOURCE_DIR}/../../../package.json" root_package)
  string(JSON MATINEE_VERSION GET "${root_package}" version)
endif()

project(matinee-desktop VERSION "${MATINEE_VERSION}" LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
if(APPLE)
  # For the code that talks to AppKit.
  enable_language(OBJCXX)
  set(CMAKE_OBJCXX_STANDARD 20)
  set(CMAKE_OBJCXX_STANDARD_REQUIRED ON)
  set(CMAKE_OBJCXX_EXTENSIONS OFF)
endif()
set(CMAKE_AUTOMOC ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
  set(CMAKE_BUILD_TYPE RelWithDebInfo)
endif()

find_package(Qt6 6.8 REQUIRED COMPONENTS
  Core Gui Network OpenGL Qml Quick WebChannel WebChannelQuick WebEngineCore
  WebEngineQuick)

# libmpv: through pkg-config where the system has it, as Linux and
# Homebrew do. Elsewhere, from MPV_ROOT, set here or in the environment, a
# folder with mpv's headers under include/ and its library: the "mpv-dev"
# archives for Windows are laid out that way.
find_package(PkgConfig QUIET)
if(PkgConfig_FOUND)
  pkg_check_modules(mpv IMPORTED_TARGET mpv>=2.3)
endif()
if(TARGET PkgConfig::mpv)
  set(mpv_target PkgConfig::mpv)
else()
  set(MPV_ROOT "$ENV{MPV_ROOT}" CACHE PATH "Where mpv's headers and library are")
  find_path(MPV_INCLUDE_DIR mpv/client.h HINTS "${MPV_ROOT}/include" REQUIRED)
  find_library(MPV_LIBRARY NAMES mpv libmpv libmpv-2
    HINTS "${MPV_ROOT}" "${MPV_ROOT}/lib" REQUIRED)
  add_library(mpv UNKNOWN IMPORTED)
  set_target_properties(mpv PROPERTIES
    IMPORTED_LOCATION "${MPV_LIBRARY}"
    INTERFACE_INCLUDE_DIRECTORIES "${MPV_INCLUDE_DIR}")
  set(mpv_target mpv)
endif()

# QtKeychain: the system's where there is one, as on Linux. Windows and
# macOS have no package to rely on, so there it's built in, from the
# release nixpkgs carries.
find_package(Qt6Keychain QUIET)
if(NOT Qt6Keychain_FOUND)
  include(FetchContent)
  set(BUILD_WITH_QT6 ON CACHE BOOL "" FORCE)
  set(BUILD_SHARED_LIBS OFF)
  set(BUILD_TEST_APPLICATION OFF CACHE BOOL "" FORCE)
  set(BUILD_TRANSLATIONS OFF CACHE BOOL "" FORCE)
  FetchContent_Declare(qtkeychain
    GIT_REPOSITORY https://github.com/frankosterfeld/qtkeychain.git
    # 0.17.0
    GIT_TAG 875f77d9f61bd97fd84cca47ce3bc71186dfbd09
    EXCLUDE_FROM_ALL)
  FetchContent_MakeAvailable(qtkeychain)
  # Its headers are included as <qt6keychain/keychain.h>, as installed.
  file(MAKE_DIRECTORY "${CMAKE_CURRENT_BINARY_DIR}/generated/qt6keychain")
  file(COPY "${qtkeychain_SOURCE_DIR}/qtkeychain/keychain.h"
    DESTINATION "${CMAKE_CURRENT_BINARY_DIR}/generated/qt6keychain")
  configure_file("${qtkeychain_BINARY_DIR}/qtkeychain/qkeychain_export.h"
    "${CMAKE_CURRENT_BINARY_DIR}/generated/qt6keychain/qkeychain_export.h" COPYONLY)
endif()

qt_standard_project_setup(REQUIRES 6.8)

# The app's own pages, built by `pnpm --filter @matinee/desktop build`.
set(MATINEE_SHELL_PAGES "${CMAKE_CURRENT_SOURCE_DIR}/../dist"
  CACHE PATH "The built pages the shell shows for servers and sign-in")
if(NOT EXISTS "${MATINEE_SHELL_PAGES}/index.html")
  message(FATAL_ERROR
    "No pages in ${MATINEE_SHELL_PAGES}. Build them first: "
    "pnpm --filter @matinee/desktop build")
endif()
file(GLOB_RECURSE shell_pages CONFIGURE_DEPENDS "${MATINEE_SHELL_PAGES}/*")

configure_file(src/app/version.h.in generated/version.h @ONLY)

qt_add_executable(matinee-desktop
  src/main.cpp
  src/app/application.cpp
  src/app/application.h
  src/app/paths.cpp
  src/app/paths.h
  src/app/settings.cpp
  src/app/settings.h
  src/app/single_instance.cpp
  src/app/single_instance.h
  src/bridge/bridge.cpp
  src/bridge/bridge.h
  src/os/media_controls.h
  src/os/sleep_inhibitor.h
  src/player/mpv_player.cpp
  src/player/mpv_player.h
  src/player/mpv_renderer.cpp
  src/player/mpv_renderer.h
  src/player/player_state.cpp
  src/player/player_state.h
  src/player/video_output.h
  src/servers/discovery.cpp
  src/servers/discovery.h
  src/servers/secret_store.cpp
  src/servers/secret_store.h
  src/servers/server_api.cpp
  src/servers/server_api.h
  src/servers/server_store.cpp
  src/servers/server_store.h
  src/servers/sign_in.cpp
  src/servers/sign_in.h
  src/web/request_interceptor.cpp
  src/web/request_interceptor.h
  src/web/shell_scheme.cpp
  src/web/shell_scheme.h
)

if(CMAKE_SYSTEM_NAME STREQUAL "Linux")
  find_package(Qt6 REQUIRED COMPONENTS DBus GuiPrivate)
  pkg_check_modules(wayland-client REQUIRED IMPORTED_TARGET wayland-client)
  pkg_get_variable(wayland_protocols wayland-protocols pkgdatadir)
  find_program(WAYLAND_SCANNER wayland-scanner REQUIRED)

  # Wayland's idle-inhibit protocol, from its description to C.
  set(idle_inhibit_xml
    "${wayland_protocols}/unstable/idle-inhibit/idle-inhibit-unstable-v1.xml")
  set(idle_inhibit_header
    "${CMAKE_CURRENT_BINARY_DIR}/generated/idle-inhibit-unstable-v1-client-protocol.h")
  set(idle_inhibit_code
    "${CMAKE_CURRENT_BINARY_DIR}/generated/idle-inhibit-unstable-v1-protocol.c")
  add_custom_command(
    OUTPUT "${idle_inhibit_header}" "${idle_inhibit_code}"
    COMMAND "${WAYLAND_SCANNER}" client-header "${idle_inhibit_xml}" "${idle_inhibit_header}"
    COMMAND "${WAYLAND_SCANNER}" private-code "${idle_inhibit_xml}" "${idle_inhibit_code}"
    DEPENDS "${idle_inhibit_xml}"
    VERBATIM)
  set_source_files_properties("${idle_inhibit_header}" "${idle_inhibit_code}"
    PROPERTIES SKIP_AUTOGEN ON)

  target_sources(matinee-desktop PRIVATE
    "${idle_inhibit_code}"
    "${idle_inhibit_header}"
    src/os/linux/mpris.cpp
    src/os/linux/mpris.h
    src/os/linux/media_controls_linux.cpp
    src/os/linux/sleep_inhibitor_linux.cpp
    src/os/linux/video_output_linux.cpp
    src/os/linux/wayland_video_surface.cpp
    src/os/linux/wayland_video_surface.h
    src/os/linux/wayland_idle_inhibitor.cpp
    src/os/linux/wayland_idle_inhibitor.h)
  target_link_libraries(matinee-desktop PRIVATE
    Qt6::DBus Qt6::GuiPrivate PkgConfig::wayland-client)
elseif(APPLE)
  target_sources(matinee-desktop PRIVATE
    resources/matinee.icns
    src/os/media_controls_none.cpp
    src/os/macos/mac_video_layer.h
    src/os/macos/mac_video_layer.mm
    src/os/macos/sleep_inhibitor_macos.cpp
    src/os/macos/video_output_macos.cpp)
  set_source_files_properties(resources/matinee.icns PROPERTIES
    MACOSX_PACKAGE_LOCATION Resources)
  # The layers it holds are counted for it.
  set_source_files_properties(src/os/macos/mac_video_layer.mm PROPERTIES
    COMPILE_OPTIONS -fobjc-arc)
  target_link_libraries(matinee-desktop PRIVATE
    "-framework AppKit" "-framework QuartzCore" "-framework IOKit"
    "-framework CoreFoundation")
elseif(WIN32)
  target_sources(matinee-desktop PRIVATE
    resources/matinee.manifest
    resources/matinee.rc
    src/os/media_controls_none.cpp
    src/os/windows/sleep_inhibitor_windows.cpp
    src/os/windows/video_output_windows.cpp
    src/os/windows/windows_video_surface.cpp
    src/os/windows/windows_video_surface.h)
  target_link_libraries(matinee-desktop PRIVATE dcomp)
endif()

qt_add_qml_module(matinee-desktop
  URI Matinee
  QML_FILES qml/Main.qml
  NO_RESOURCE_TARGET_PATH
)

qt_add_resources(matinee-desktop "shell-pages"
  PREFIX "/shell"
  BASE "${MATINEE_SHELL_PAGES}"
  FILES ${shell_pages})

qt_add_resources(matinee-desktop "bridge"
  PREFIX "/bridge"
  BASE src/bridge
  FILES src/bridge/transport.js)

qt_add_resources(matinee-desktop "icons"
  PREFIX "/icons"
  BASE resources
  FILES resources/matinee.svg)

target_include_directories(matinee-desktop PRIVATE
  src "${CMAKE_CURRENT_BINARY_DIR}/generated")

target_compile_definitions(matinee-desktop PRIVATE
  QT_NO_CAST_FROM_ASCII
  QT_NO_CAST_TO_ASCII
  QT_NO_URL_CAST_FROM_STRING
  QT_NO_FOREACH
  QT_NO_KEYWORDS)

if(MSVC)
  target_compile_options(matinee-desktop PRIVATE /W4 /permissive-)
else()
  target_compile_options(matinee-desktop PRIVATE
    -Wall -Wextra -Wpedantic -Wshadow -Wconversion -Wno-sign-conversion)
endif()

target_link_libraries(matinee-desktop PRIVATE
  Qt6::Core Qt6::Gui Qt6::Network Qt6::OpenGL Qt6::Qml Qt6::Quick
  Qt6::WebChannel Qt6::WebChannelQuick Qt6::WebEngineCore
  Qt6::WebEngineQuick qt6keychain ${mpv_target})

set_target_properties(matinee-desktop PROPERTIES
  WIN32_EXECUTABLE ON
  MACOSX_BUNDLE ON
  OUTPUT_NAME "$<IF:$<PLATFORM_ID:Darwin>,Matinee,matinee-desktop>"
  MACOSX_BUNDLE_BUNDLE_NAME "Matinee"
  MACOSX_BUNDLE_ICON_FILE "matinee.icns"
  MACOSX_BUNDLE_GUI_IDENTIFIER "io.github.zekurio.matinee"
  MACOSX_BUNDLE_BUNDLE_VERSION "${PROJECT_VERSION}"
  MACOSX_BUNDLE_SHORT_VERSION_STRING "${PROJECT_VERSION}")

include(GNUInstallDirs)
install(TARGETS matinee-desktop
  BUNDLE DESTINATION .
  RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR})
if(CMAKE_SYSTEM_NAME STREQUAL "Linux")
  install(FILES resources/io.github.zekurio.matinee.desktop
    DESTINATION ${CMAKE_INSTALL_DATADIR}/applications)
  install(FILES resources/matinee.svg
    DESTINATION ${CMAKE_INSTALL_DATADIR}/icons/hicolor/scalable/apps
    RENAME io.github.zekurio.matinee.svg)
endif()
