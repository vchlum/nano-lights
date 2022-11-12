#!/bin/bash

glib-compile-schemas schemas/
zip -r nano-lights@chlumskyvaclav.gmail.com.zip . --exclude=po/\* --exclude=.git/\* --exclude=\*.sh --exclude=schemas/\*.xml --exclude=screenshot.png --exclude=*.zip --exclude=FUNDING.yml
