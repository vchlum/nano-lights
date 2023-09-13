# nano-lights
![screenshot](https://github.com/vchlum/nano-lights/blob/main/screenshot.png)

## Gnome Shell extension
nano-lights is a Gnome Shell extension for controlling Nanoleaf lights on local network.

## Supported Gnome Shell version
This extension supports Gnome Shell verison 45 and above.

## Installation from e.g.o
https://extensions.gnome.org/extension/5519/nano-lights/

## Manual installation

 1. `git clone https://github.com/vchlum/nano-lights.git`
 1. `cd nano-lights`
 1. `make build`
 1. `make install`
 1. Log out & Log in
 1. `gnome-extensions enable nano-lights@chlumskyvaclav.gmail.com`

## Install dependencies
  - These are only required to install from source
  - `make`
  - `gnome-shell` (`gnome-extensions` command)
  - `glib-compile-resources`
  - `libglib2.0-dev-bin`
  - `gettext`
  - These are recommended to run the extension
  - `avahi-tools` (`avahi-browse` command for discovering devices on local network)
  