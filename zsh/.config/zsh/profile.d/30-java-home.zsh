# Prefer a verified Amazon Corretto 21 JDK over whichever Java happens to be first on PATH.
_corretto_candidates=(
  "$JAVA_HOME"
  "$HOME/Library/Java/JavaVirtualMachines/amazon-corretto-21.jdk/Contents/Home"
  /Library/Java/JavaVirtualMachines/amazon-corretto-21.jdk/Contents/Home
  /Library/Java/JavaVirtualMachines/amazon-corretto-21-aarch64.jdk/Contents/Home
  /usr/lib/jvm/java-21-amazon-corretto
  /usr/lib/jvm/amazon-corretto-21
)
for _corretto_home in $_corretto_candidates; do
  if [[ -x "$_corretto_home/bin/java" && -x "$_corretto_home/bin/javac" && -r "$_corretto_home/release" ]] \
    && command grep -q '^JAVA_VERSION="21\.' "$_corretto_home/release" \
    && command grep -Eq '^IMPLEMENTOR="(Amazon\.com Inc\.|Amazon Corretto)' "$_corretto_home/release"; then
    export JAVA_HOME="$_corretto_home"
    typeset -gU path PATH
    path=("$JAVA_HOME/bin" $path)
    break
  fi
done
unset _corretto_candidates _corretto_home
