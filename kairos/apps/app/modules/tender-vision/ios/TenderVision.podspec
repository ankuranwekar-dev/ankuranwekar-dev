Pod::Spec.new do |s|
  s.name           = 'TenderVision'
  s.version        = '1.0.0'
  s.summary        = 'On-device text recognition and perspective correction for photos of a calendar'
  s.description    = 'Wraps Apple Vision text recognition and a small perspective warp. Nothing leaves the device.'
  s.author         = 'Ankur Anwekar'
  s.homepage       = 'https://github.com/ankuranwekar-dev/ankuranwekar-dev'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '16.4' }
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
  s.source_files = '**/*.{h,m,mm,swift}'
end
