#!/usr/bin/env ruby
# Writes tvos/Runner.xcodeproj. The project is checked in, and this is how
# it's made: nobody has to open Xcode to add a file to it, and the files the
# Apple TV app shares with the iPhone app are listed in one place. After
# changing the lists below, run it and commit what it writes:
#
#   ruby tvos/scripts/project.rb
#
# It needs the xcodeproj gem, which CocoaPods brings along on a Mac. On
# NixOS: nix shell --impure --expr \
#   '(builtins.getFlake "nixpkgs").legacyPackages.${builtins.currentSystem}.ruby.withPackages (p: [ p.xcodeproj ])'
require 'xcodeproj'

TVOS = File.expand_path('..', __dir__)
DEPLOYMENT_TARGET = '16.0'

# The Apple TV app's own sources, in tvos/Runner.
OWN = %w[
  AppDelegate.swift
  AppleTvBridge.swift
  MatineeViewController.swift
  PlayerSystem.swift
  SystemBridge.swift
  Pigeon/AppleTv.g.swift
].freeze

# What it compiles of the iPhone app, in ios/Runner: the player, the
# bridges that need nothing an Apple TV lacks, and their channels.
SHARED = %w[
  Bridges/DeviceBridge.swift
  Bridges/DisplayBridge.swift
  Pigeon/Device.g.swift
  Pigeon/Display.g.swift
  Pigeon/Player.g.swift
  Pigeon/PlayerSystem.g.swift
  Pigeon/System.g.swift
  Player/Capabilities.swift
  Player/CaptionStyle.swift
  Player/MpvEngine.swift
  Player/NowPlaying.swift
  Player/PlayerBridge.swift
  Player/VideoHost.swift
].freeze

# libmpv and FFmpeg for tvOS, the same package and revision as ios/Runner.
MPV_URL = 'https://github.com/edde746/mpv-build'
MPV_REVISION = '6dbda06021b128b7adc30161bf7870977e575135'

path = File.join(TVOS, 'Runner.xcodeproj')
project = Xcodeproj::Project.new(path, false, 54)
project.root_object.attributes['LastUpgradeCheck'] = '1510'
project.root_object.development_region = 'en'
project.root_object.known_regions = %w[en Base]

target = project.new_target(:application, 'Runner', :tvos, DEPLOYMENT_TARGET, nil, :swift)
# The template links Foundation by a path into one version of the SDK. Swift
# links what it imports by itself.
target.frameworks_build_phase.clear
project.frameworks_group.clear

flutter = project.main_group.new_group('Flutter', 'Flutter')
configs = {
  'Debug' => flutter.new_file('Debug.xcconfig'),
  'Release' => flutter.new_file('Release.xcconfig'),
}
flutter.new_file('Generated.xcconfig')
flutter.new_file('AppFrameworkInfo.plist')

runner = project.main_group.new_group('Runner', 'Runner')
OWN.each { |file| target.source_build_phase.add_file_reference(runner.new_file(file), true) }
runner.new_file('Info.plist')
target.resources_build_phase.add_file_reference(runner.new_file('Assets.xcassets'), true)
%w[Main LaunchScreen].each do |name|
  storyboard = runner.new_variant_group("#{name}.storyboard")
  storyboard.new_file("Base.lproj/#{name}.storyboard").name = 'Base'
  target.resources_build_phase.add_file_reference(storyboard, true)
end

shared = project.main_group.new_group('iOS', '../ios/Runner')
SHARED.each do |file|
  raise "ios/Runner/#{file} is gone" unless File.exist?(File.join(TVOS, '../ios/Runner', file))
  target.source_build_phase.add_file_reference(shared.new_file(file), true)
end

project.build_configurations.each do |config|
  # Build phases call the scripts in tvos/scripts and ios/version.sh, which
  # read and write outside what a sandboxed script may.
  config.build_settings['ENABLE_USER_SCRIPT_SANDBOXING'] = 'NO'
  config.build_settings['TVOS_DEPLOYMENT_TARGET'] = DEPLOYMENT_TARGET
end

target.build_configurations.each do |config|
  config.base_configuration_reference = configs.fetch(config.name)
  # The template's, for an accent color and previews the app doesn't have.
  %w[ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME ENABLE_PREVIEWS].each { |key| config.build_settings.delete(key) }
  config.build_settings.merge!(
    'ASSETCATALOG_COMPILER_APPICON_NAME' => 'AppIcon',
    'CODE_SIGN_STYLE' => 'Automatic',
    'ENABLE_BITCODE' => 'NO',
    'INFOPLIST_FILE' => 'Runner/Info.plist',
    'LD_RUNPATH_SEARCH_PATHS' => ['$(inherited)', '@executable_path/Frameworks'],
    'PRODUCT_BUNDLE_IDENTIFIER' => 'io.github.zekurio.matinee',
    'PRODUCT_NAME' => '$(TARGET_NAME)',
    'SWIFT_VERSION' => '5.0',
    'TARGETED_DEVICE_FAMILY' => '3',
    'TVOS_DEPLOYMENT_TARGET' => DEPLOYMENT_TARGET,
  )
end

package = project.new(Xcodeproj::Project::Object::XCRemoteSwiftPackageReference)
package.repositoryURL = MPV_URL
package.requirement = { 'kind' => 'revision', 'revision' => MPV_REVISION }
project.root_object.package_references << package
mpv = project.new(Xcodeproj::Project::Object::XCSwiftPackageProductDependency)
mpv.product_name = 'MPVKit'
mpv.package = package
target.package_product_dependencies << mpv
linked = project.new(Xcodeproj::Project::Object::PBXBuildFile)
linked.product_ref = mpv
target.frameworks_build_phase.files << linked

def script(target, name, command)
  phase = target.new_shell_script_build_phase(name)
  phase.shell_path = '/bin/sh'
  phase.shell_script = "#{command}\n"
  phase.always_out_of_date = '1'
  phase
end

# Before anything compiles: the Swift code imports the Flutter module the
# engine's framework has.
build = script(target, 'Flutter', '/bin/bash "$SRCROOT/scripts/build.sh" build')
target.build_phases.move(build, 0)
script(target, 'Embed Flutter', '/bin/bash "$SRCROOT/scripts/build.sh" embed')
# The version of every part is the root package.json's.
script(target, 'Version',
       '/bin/sh "$SRCROOT/../ios/version.sh" "$SRCROOT/../../../package.json" "$TARGET_BUILD_DIR/$INFOPLIST_PATH"')

# The same ids every time, so a second run changes nothing.
project.predictabilize_uuids
project.save

scheme = Xcodeproj::XCScheme.new
scheme.add_build_target(target)
scheme.set_launch_target(target)
scheme.save_as(path, 'Runner', true)
puts "Wrote #{path}"
