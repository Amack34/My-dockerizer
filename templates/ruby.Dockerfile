# Base image
FROM ruby:2.7

# Set the working directory
WORKDIR /app

# Install dependencies
COPY Gemfile Gemfile.lock ./
RUN bundle install

# Copy the rest of the application code
COPY . .

# Expose the application port
EXPOSE 3000

# Start the application (modify the command as per your app)
CMD ["rails", "server", "-b", "0.0.0.0"]