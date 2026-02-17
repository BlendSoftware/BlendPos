package infra

import (
	"context"

	"github.com/redis/go-redis/v9"
)

// NewRedis creates and validates a go-redis client connection.
func NewRedis(redisURL string) (*redis.Client, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, err
	}

	rdb := redis.NewClient(opts)

	// Validate connectivity at startup
	if err := rdb.Ping(context.Background()).Err(); err != nil {
		return nil, err
	}

	return rdb, nil
}
