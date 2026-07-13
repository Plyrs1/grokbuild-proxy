package storage

import (
	"os"
)

// ProxyPool holds the runtime proxy pool configuration.
type ProxyPool struct {
	Enabled bool     `json:"enabled"`
	Proxies []string `json:"proxies"`
}

type proxyPoolDoc struct {
	ProxyPool ProxyPool `json:"proxy_pool"`
}

// LoadProxyPool reads the proxy pool from disk. Returns a zero value
// (Enabled=false, empty list) when the file does not exist.
func (s *Store) LoadProxyPool() (ProxyPool, error) {
	var doc proxyPoolDoc
	err := s.withLock(func() error {
		return readJSONFile(s.proxiesPath(), &doc)
	})
	if err != nil {
		if os.IsNotExist(err) {
			return ProxyPool{Proxies: []string{}}, nil
		}
		return ProxyPool{}, err
	}
	if doc.ProxyPool.Proxies == nil {
		doc.ProxyPool.Proxies = []string{}
	}
	return doc.ProxyPool, nil
}

// SaveProxyPool persists the proxy pool to disk atomically.
func (s *Store) SaveProxyPool(pool ProxyPool) error {
	if pool.Proxies == nil {
		pool.Proxies = []string{}
	}
	return s.withLock(func() error {
		return writeJSONFile(s.proxiesPath(), proxyPoolDoc{ProxyPool: pool})
	})
}
