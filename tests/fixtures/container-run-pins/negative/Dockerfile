FROM ubuntu:24.04
ARG NODE_VERSION
RUN nvm install "$NODE_VERSION" && \
    pyenv install $(cat .python-version) && \
    (sdk install java 16.0.2-tem) && \
    asdf install ruby `cat .ruby-version`
RUN echo $(nvm install 16)
