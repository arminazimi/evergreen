FROM eclipse-temurin:17 AS build
COPY . /workspace
WORKDIR /workspace
RUN ./mvnw -q -DskipTests package

FROM eclipse-temurin:17
COPY --from=build /workspace/target/app.jar /app.jar
ENTRYPOINT ["java", "-jar", "/app.jar"]
