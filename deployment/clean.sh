#!/usr/bin/env bash
echo "removing daemon"
sudo rm /Library/LaunchDaemons/org.nixos.nix-daemon.plist

echo "removing daemon created users and groups"
USERS=$(sudo dscl . list /Users | grep nixbld)

for USER in $USERS; do
    sudo /usr/bin/dscl . -delete "/Users/$USER"
    sudo /usr/bin/dscl . -delete /Groups/staff GroupMembership $USER;
done

sudo /usr/bin/dscl . -delete "/Groups/nixbld"

echo "reverting system shell configurations"
sudo mv /etc/profile.backup-before-nix /etc/profile
sudo mv /etc/bashrc.backup-before-nix /etc/bashrc
sudo mv /etc/zshrc.backup-before-nix /etc/zshrc

echo "removing nix files"
sudo rm -rf /nix
sudo rm -rf /etc/nix
sudo rm -rf /etc/profile/nix.sh
sudo rm -rf /var/root/.nix-profile
sudo rm -rf /var/root/.nix-defexpr
sudo rm -rf /var/root/.nix-channels
sudo rm -rf /var/root/.cache/nix
rm -rf ~/.nix-profile
rm -rf ~/.nix-defexpr
rm -rf ~/.nix-channels
rm -rf ~/.nixpkgs
rm -rf ~/.config/nixpkgs
rm -rf ~/.cache/nix
