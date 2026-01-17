# Gemfile - Ruby 依赖管理
source "https://rubygems.org"

# fastlane 核心
gem "fastlane"

# CocoaPods（如果项目使用）
gem "cocoapods"

# 加载 fastlane 插件（如果有）
plugins_path = File.join(File.dirname(__FILE__), 'fastlane', 'Pluginfile')
eval_gemfile(plugins_path) if File.exist?(plugins_path)
